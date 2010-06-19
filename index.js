(function(context) {
    var http = require("http");
    var url = require("url");
    var sys = require("sys");
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
    
    var urls = {};
    
    function error(req, res) { 
        var body = "404'd";
        res.writeHead(404, { "Content-Length": body.length,
                             "Content-Type": "text/plain" });
        res.end(body);
        
        sys.puts("Someone 404'd: " + req.url);
    }
    
    var patterns = [];
    function findPattern(req) {
        for(var i = 0, l = patterns.length; i < l; i++) {
            if(patterns[i].test(req)) { return patterns[i].handler; }
        }
        
        return null;
    }
    
    var server = http.createServer(function(req, res) {
        (urls[url.parse(req.url).pathname] || findPattern(req) || context.error)(req, res);
    });
    
    context.urls = urls;
    context.patterns = patterns;
    context.error = error;
    context.server = server;
    context.staticFileHandler = staticFileHandler;
    context.staticDirHandler = staticDirHandler;
})(exports);