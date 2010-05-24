(function(context) {
    var http = require("http");
    var url = require("url");
    var sys = require("sys");
    var fs = require("fs");

    var staticFileHandler = (function() {
        function Handler(path, mime, req, res) {
            fs.readFile(path, function(err, data) {
                if(err) { throw err; };
                
                res.writeHead(200, { "Conent-Length": data.length,
                                     "Content-Type": mime });
                res.end(data, "utf8");
            });
        }

        return function(path, mime) {
            return function(req, res) { Handler(path, mime, req, res); }; 
        };
    })();
    
    var urls = {},
        patterns = [],
        error = function(req, res) { 
            var body = "404'd";
            res.writeHead(404, { "Content-Length": body.length,
                                 "Content-Type": "text/plain" });
            res.end(body);
            
            sys.puts("Someone 404'd: " + req.url);
        };

    function findPattern(req) {
        for(var i = 0, l = patterns.length; i < l; i++) {
            if(patterns[i].test(req)) { return patterns[i].handler; }
        }
        
        return null;
    }    
        
    var server = http.createServer(function(req, res) {
        (urls[url.parse(req.url).pathname] || findPattern(req) || error)(req, res);
    });
    
    context.urls = urls;
    context.patterns = patterns;
    context.error = error;
    context.server = server;
    context.staticFileHandler = staticFileHandler;
})(exports);