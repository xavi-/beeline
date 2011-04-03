(function(context, undefined) {
    var url = require("url");
    var fs = require("fs");
    var path = require("path");
    
    var getBuffer = (function() {
        var buffers = {};
        
        function addBuffer(path) {
            if(path in buffers) { return; }
            
            buffers[path] = null;
            fs.watchFile(path, function() { buffers[path] = null; });
        }
        
        return function getBuffer(filePath, callback) {
            if(buffers[filePath]) { return callback(null, buffers[filePath]); }
            
            path.exists(filePath, function(exists) {
                if(!exists) { return callback("file-not-found", null); }
                
                fs.readFile(filePath, function(err, data) {
                    if(err) { callback(err); };

                    addBuffer(filePath);
                    buffers[filePath] = data;
                    callback(err, data);
                });
            });
        };
    })();
    
    var staticFileHandler = (function() {
        function handler(path, mimeType, req, res) {
            getBuffer(path, function(err, buffer) {
                if(err === "file-not-found") {
                    console.error("Could find file: " + path);
                    return default404(req, res);
                }
                
                if(err) { throw err; };
                
                res.writeHead(200, { "Conent-Length": buffer.length,
                                     "Content-Type": mimeType });
                res.end(buffer, "binary");
            });
        }
        
        return function staticFileHandler(path, mime) {
            return function(req, res) { handler(path, mime, req, res); }; 
        };
    })();
    
    function staticDirHandler(fileDir, mimeLookup) {
        return function(req, res, match) {
            var filePath = path.join.apply(path, [ fileDir ].concat(match));
            var ext = path.extname(filePath);
            
            if(!(ext in mimeLookup || ext.substr(1) in mimeLookup)) {
                console.error("Could find file: " + filePath);
                return default404(req, res);
            }
            
            getBuffer(filePath, function(err, buffer) {
                if(err === "file-not-found") {
                    console.error("Could find file: " + filePath);
                    return default404(req, res);
                }
                
                if(err) { throw err; }
                
                res.writeHead(200, { "Content-Length": buffer.length,
                                     "Content-Type": mimeLookup[ext] });
                res.end(buffer, "binary");
            });
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
        var body = [ "503'd" ];
        body.push("An exception was thrown while accessing: " + req.method + " " + req.url);
        body.push("Exception: " + err.message);
        body.push(err.stack);
        body = body.join("\n");
        res.writeHead(503, { "Content-Length": body.length,
                             "Content-Type": "text/plain" });
        res.end(body);
        
        console.error("Error accessing: " + req.method + " " + req.url);
        console.error(err.message);
        console.error(err.stack);
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
        var urls = {}, patterns = [], generics = [], missing = default404, error = default503;
        
        function handler(req, res) {
            try {
                var path = url.parse(req.url).pathname;
                var info = (urls[path] || findPattern(patterns, path) || findGeneric(generics, req) || missing);
                var handler = info.handler || info;
                var extra = info.extra;
                
                (handler[req.method] || handler.any || handler).call(this, req, res, extra);
            } catch(err) {
                error.call(this, req, res, err);
            }
        }
        handler.add = function(routes) {
            for(var key in routes) {
                key.split(/\s+/).forEach(function(route) {
                    if(route.indexOf("`") === -1) {
                        urls[route] = routes[key];
                    } else if(route === "`404`" || route === "`missing`" || route === "`default`") {
                        missing = routes[key];
                    } else if(route === "`503`" || route === "`error`") {
                        error = routes[key];
                    } else if(rPattern.test(route)) {
                        patterns.push({ regx: new RegExp(rPattern.exec(route)[1]), handler: routes[key] });
                    } else if(route === "`generics`") {
                        Array.prototype.push.apply(generics, routes[key]);
                    }
                });
            }
        };
        handler.add(routes);
        
        return handler;
    };
    context.route = route;
    context.staticFileHandler = staticFileHandler;
    context.staticDirHandler = staticDirHandler;
})(exports);