var assert = require("assert");
var bee = require("../");

var line = bee.line({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "r`^/name/([\\w-]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/name/woo");
        assert.equal(matches[0], "woo");
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
    },
    "`503`": function(req, res, err) {
        assert.equal(req.url, "/throw-error");
        assert.equal(err.message, "503 should catch");
    }
});
line({ url: "/test?param=1&woo=2" }, {});
line({ url: "/throw-error" }, {});
line({ url: "/name/woo" }, {});
line({ url: "/random", triggerGeneric: true }, {});
line({ url: "/url-not-found" }, {});

line.add({ 
    "/ /index": function(req, res) { assert.ok(req.url === "/" || req.url === "/index"); }
});
line({ url: "/" }, {});
line({ url: "/index" }, {});