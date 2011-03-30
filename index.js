(function(context, undefined) {
    var url = require("url");
    var fs = require("fs");
    
    var buffer = (function() {
        var buffers = {};
        
        function addBuffer(path) {
            if(path in buffers) { return; }
            
            buffers[path] = null;
            fs.watchFile(path, function() { buffers[path] = null; });
        }
        
        function getBuffer(path, callback) {
            if(buffers[path]) { callback(null, buffers[path]); return; }
            
            fs.readFile(path, function(err, data) {
                if(err) { callback(err); };
                
                buffers[path] = data;
                callback(err, data);
            });
        }
        
        return { add: addBuffer, get: getBuffer };
    })();
    
    var staticFileHandler = (function() {
        function handler(path, mimeType, res) {
            buffer.get(path, function(err, buffer) {
                if(err) { throw err; };
                
                res.writeHead(200, { "Conent-Length": buffer.length,
                                     "Content-Type": mimeType });
                res.end(buffer, "binary");
            });
        }
        
        return function staticFileHandler(path, mime) {
            buffer.add(path);
            return function(req, res) { handler(path, mime, res); }; 
        };
    })();
    
    function staticDirHandler(urlPath, fileDir, extension, mimeType) {
        var regUrl = new RegExp(urlPath + "([/a-zA-Z0-9_-]+)\." + extension);
        
        return {
            test: function(req) { return regUrl.test(url.parse(req.url).pathname); },
            handler: function(req, res) {
                var uri = url.parse(req.url);
                var urlName = regUrl.exec(uri.pathname)[1];
                
                buffer.add(fileDir + urlName + "." + extension);
                
                buffer.get(fileDir + urlName + "." + extension, function(err, buffer) {
                    if(err) { throw err; }
                    
                    res.writeHead(200, { "Content-Length": buffer.length,
                                         "Content-Type": mimeType });
                    res.end(buffer, "binary");
                });
            }
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
    context.line = function(routes) {
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
            for(var route in routes) {
                if(route.indexOf("`") === -1) {
                    urls[route] = routes[route];
                } else if(route === "`404`" || route === "`missing`" || route === "`default`") {
                    missing = routes[route];
                } else if(route === "`503`" || route === "`error`") {
                    error = routes[route];
                } else if(rPattern.test(route)) {
                    patterns.push({ regx: new RegExp(rPattern.exec(route)[1]), handler: routes[route] });
                } else if(route === "`generics`") {
                    Array.prototype.push.apply(generics, routes[route]);
                }
            }
        };
        handler.add(routes);
        
        return handler;
    };
    context.staticFileHandler = staticFileHandler;
    context.staticDirHandler = staticDirHandler;
})(exports);