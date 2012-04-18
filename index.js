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
                    if(err) { return callback(err, null); }
                    
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
            
            if(err) { throw err; }
            
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
        
        return function(req, res, extra, matches) {
            matches = matches || extra;
            var filePath = path.join.apply(path, [ fileDir ].concat(matches));
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
    function default405(req, res) {
        var body = "405'd";
        res.writeHead(404, { "Content-Length": body.length,
                             "Content-Type": "text/plain" });
        res.end(body);

        console.log("Someone 405'd -- url: " + req.url + "; verb: " + req.method);
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
            if(patterns[i].regex.test(path)) {
                return { handler: patterns[i].handler, extra: patterns[i].regex.exec(path).slice(1) };
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

    var rRegExUrl = /^r`(.*)`$/, rToken = /`(.*?)(\.\.\.)?`/g;
    function createTokenHandler(names, handler) {
        return function(req, res, vals) {
            var extra = Object.create(null);
            for(var i = 0; i < names.length; i++) {
                extra[names[i]] = vals[i];
            }
            executeHandler(handler, this, req, res, extra, vals);
        };
    }
    function parseToken(rule, handler) {
        var tokens = [];
        var transform = rule.replace(rToken, function replaceToken(_, token, isExtend) {
            tokens.push(token);
            return (isExtend ? "(.*?)" : "([^/]*?)");
        });
        var rRule = new RegExp("^" + transform + "$");
        return { regex: rRule, handler: createTokenHandler(tokens, handler) };
    }

    function executeHandler(handler, thisp, req, res, extra, vals) {
        (handler[req.method] || handler.any || handler).call(thisp, req, res, extra, vals);
    }
    function route(routes) {
        var preprocess = [], urls = {}, patterns = [], generics = [];
        var missing = default404, missingVerb = default405, error = default503;
        
        function handler(req, res) {
            try {
                var path = url.parse(req.url).pathname;
                var info = (urls[path] || findPattern(patterns, path) || findGeneric(generics, req) || missing);
                var handler = info.handler || info;
                var extra = info.extra;
                
                preprocess.forEach(function(process) { process(req, res); });
                
                executeHandler(handler, this, req, res, extra);
            } catch(err) {
                error.call(this, req, res, err);
            }
        }
        handler.add = function(routes) {
            for(var key in routes) {
                var handler = routes[key];

                if(Object.prototype.toString.call(handler) === "[object Object]") {
                    handler.any = handler.any || function() { missingVerb.apply(this, arguments); };
                }

                if(key === "`preprocess`") {
                    if(!Array.isArray(handler)) { preprocess.push(handler); }
                    else { Array.prototype.push.apply(preprocess, handler); }
                    continue;
                }

                key.split(/\s+/).forEach(function(rule) {
                    if(rule.indexOf("`") === -1) {
                        if(rule in urls) { console.warn("Duplicate beeline rule: " + rule); }
                        urls[rule] = handler;
                    } else if(rule === "`404`" || rule === "`missing`" || rule === "`default`") {
                        if(missing !== default404) { console.warn("Duplicate beeline rule: " + rule); }
                        missing = handler;
                    } else if(rule === "`405`" || rule === "`missing-verb`" || rule === "`missingVerb`") {
                        if(missingVerb !== default405) { console.warn("Duplicate beeline rule: " + rule); }
                        missingVerb = handler;
                    } else if(rule === "`503`" || rule === "`error`") {
                        if(error !== default503) { console.warn("Duplicate beeline rule: " + rule); }
                        error = handler;
                    } else if(rule === "`generics`") {
                        Array.prototype.push.apply(generics, handler);
                    } else if(rRegExUrl.test(rule)) {
                        var rRule = new RegExp(rRegExUrl.exec(rule)[1]);
                        if(patterns.some(function(p) { return p.regex.toString() === rRule.toString(); })) {
                            console.warn("Duplicate beeline rule: " + rule);
                        }
                        patterns.push({ regex: rRule, handler: handler });
                    } else if(rToken.test(rule)) {
                        var pattern = parseToken(rule, handler);
                        if(patterns.some(function(p) { return p.regex.toString() === pattern.regex.toString(); })) {
                            console.warn("Duplicate beeline rule: " + rule);
                        }
                        patterns.push(pattern);
                    } else {
                        console.warn("Invalid beeline rule: " + rule);
                    }
                });
            }
        };
        handler.missing = function(req, res, thisp) {
            missing.call(thisp, req, res);
        };
        handler.missingVerb = function(req, res, thisp) {
            missingVerb.call(thisp, req, res);
        };
        handler.error = function(req, res, err, thisp) {
            error.call(thisp, req, res, err);
        };
        handler.add(routes);
        
        return handler;
    }
    context.route = route;
    context.staticFile = staticFile;
    context.staticDir = staticDir;
})(exports);