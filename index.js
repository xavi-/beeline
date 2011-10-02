(function(context, undefined) {
    var url = require("url");
    var fs = require("fs");
    var path = require("path");
    var crypto = require("crypto");
    
    var getBuffer = (function() {
        var buffers = {};
        
        function watchBuffer(path) {
            if(path in buffers) { return; }
            
            buffers[path] = null;
            fs.watchFile(path, function() { buffers[path] = null; });
        }
        
        return function getBuffer(filePath, callback) {
            if(buffers[filePath]) { return callback(null, buffers[filePath]); }
            
            path.exists(filePath, function(exists) {
                if(!exists) { return callback({ "file-not-found": true, path: filePath }, null); }
                
                fs.readFile(filePath, function(err, data) {
                    if(err) { return callback(err, null); };
                    
                    watchBuffer(filePath);
                    buffers[filePath] = { data: data, sum: crypto.createHash("sha1").update(data).digest("hex") };
                    callback(null, buffers[filePath]);
                });
            });
        };
    })();
    
    function sendBuffer(req, res, mimeType) {
        return function(err, buffer) {
            if(err && err["file-not-found"]) {
                console.error("Could not find file: " + err.path);
                return default404(req, res);
            }
            
            if(err) { throw err; };
            
            res.removeHeader("Set-Cookie");
            res.setHeader("Cache-Control", "private, max-age=31536000");
            res.setHeader("ETag", buffer.sum);
            
            if(req.headers["if-none-match"] === buffer.sum) {
                res.writeHead(304, { "ETag": buffer.sum });
                return res.end();
            }
            res.writeHead(200, { "Content-Length": buffer.data.length,
                                 "Content-Type": mimeType });
            res.end(buffer.data, "binary");
        };
    }
    
    var staticFile = (function() {
        function handler(path, mimeType, req, res) {
            getBuffer(path, sendBuffer(req, res, mimeType));
        }
        
        return function staticFile(path, mime) {
            return function(req, res) { handler(path, mime, req, res); }; 
        };
    })();
    
    function staticDir(fileDir, mimeLookup) {
        for(var key in mimeLookup) {
            if(key.charAt(0) !== ".") {
                console.warn("Extension found without a leading periond ('.'): '" + key + "'");
            }
        }
        
        return function(req, res, match) {
            var filePath = path.join.apply(path, [ fileDir ].concat(match));
            var ext = path.extname(filePath).toLowerCase();
            
            if(!(ext in mimeLookup)) {
                console.error("Could not find file: " + filePath);
                return default404(req, res);
            }
            
            getBuffer(filePath, sendBuffer(req, res, mimeLookup[ext]));
        };
    }
    
    function default404(req, res) {
        var body = "404'd";
        res.writeHead(404, { "Content-Length": body.length,
                             "Content-Type": "text/plain" });
        res.end(body);
        
        console.log("Someone 404'd: " + req.url);
    }
    
    function default503(req, res, err) {
        console.error("Error accessing: " + req.method + " " + req.url);
        console.error(err.message);
        console.error(err.stack);
        
        var body = [ "503'd" ];
        body.push("An exception was thrown while accessing: " + req.method + " " + req.url);
        body.push("Exception: " + err.message);
        body.push(err.stack);
        body = body.join("\n");
        res.writeHead(503, { "Content-Length": body.length,
                             "Content-Type": "text/plain" });
        res.end(body);
    }
    
    function findPattern(patterns, path) {
        for(var i = 0, l = patterns.length; i < l; i++) {
            if(patterns[i].regx.test(path)) {
                return { handler: patterns[i].handler, extra: patterns[i].regx.exec(path).slice(1) }; 
            }
        }
        
        return null;
    }
    
    function findGeneric(generics, req) {
        for(var i = 0, l = generics.length; i < l; i++) {
            if(generics[i].test(req)) { return generics[i].handler; }
        }
        
        return null;
    }
    
    var rPattern = /^r`(.*)`$/;
    function route(routes) {
        var preprocess = [], urls = {}, patterns = [], generics = [], missing = default404, error = default503;
        
        function handler(req, res) {
            try {
                var path = url.parse(req.url).pathname;
                var info = (urls[path] || findPattern(patterns, path) || findGeneric(generics, req) || missing);
                var handler = info.handler || info;
                var extra = info.extra;
                
                preprocess.forEach(function(process) { process(req, res); });
                
                (handler[req.method] || handler.any || handler).call(this, req, res, extra);
            } catch(err) {
                error.call(this, req, res, err);
            }
        }
        handler.add = function(routes) {
            for(var key in routes) {
                if(key === "`preprocess`") {
                    if(!Array.isArray(routes[key])) { preprocess.push(routes[key]); }
                    else { Array.prototype.push.apply(preprocess, routes[key]); }
                    continue;
                }
                
                key.split(/\s+/).forEach(function(rule) {
                    if(rule.indexOf("`") === -1) {
                        if(rule in urls) { console.warn("Duplicate beeline rule: " + rule); }
                        urls[rule] = routes[key];
                    } else if(rule === "`404`" || rule === "`missing`" || rule === "`default`") {
                        if(missing !== default404) { console.warn("Duplicate beeline rule: " + rule); }
                        missing = routes[key];
                    } else if(rule === "`503`" || rule === "`error`") {
                        if(error !== default503) { console.warn("Duplicate beeline rule: " + rule); }
                        error = routes[key];
                    } else if(rPattern.test(rule)) {
                        var rRule = new RegExp(rPattern.exec(rule)[1]);
                        if(patterns.some(function(p) { return p.regx.toString() === rRule.toString(); })) {
                            console.warn("Duplicate beeline rule: " + rule);
                        }
                        patterns.push({ regx: rRule, handler: routes[key] });
                    } else if(rule === "`generics`") {
                        Array.prototype.push.apply(generics, routes[key]);
                    } else {
                        console.warn("Invalid beeline rule: " + rule);
                    }
                });
            }
        };
        handler.add(routes);
        
        return handler;
    };
    context.route = route;
    context.staticFile = staticFile;
    context.staticDir = staticDir;
})(exports);