(function(context) {
    var http = require("http");
    var url = require("url");
    var sys = require("sys");
    var fs = require("fs");

    var staticFileHandler = (function() {
        var buffer = (function() {
            var buffers = {};
            
            function addBuffer(path) {
                fs.watchFile(path, function() { buffers[path] = null; });
            }
        
            function getBuffer(path, callback) {
                if(buffers[path]) { sys.puts("hit cache"); callback(null, buffers[path]); }
                else { sys.puts("miss cache");
                    fs.readFile(path, function(err, data) {
                        if(err) { callback(err); };
                
                        buffers[path] = data;
                        callback(err, data);
                    });
                }
            }
        
            return { add: addBuffer, get: getBuffer };
        })();
        
        function Handler(path, mime, res) {
            buffer.get(path, function(err, buffer) {
                if(err) { throw err; };
                
                res.writeHead(200, { "Conent-Length": buffer.length,
                                     "Content-Type": mime });
                res.end(buffer);
            });
        }

        return function(path, mime) {
            buffer.add(path);
            return function(req, res) { Handler(path, mime, res); }; 
        };
    })();
    
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
})(exports);