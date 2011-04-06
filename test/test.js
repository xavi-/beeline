var assert = require("assert");
var bee = require("../");

var mockResponse = {
    testCount: 12,
    end: function() { this.testCount--; }
}

var router = bee.route({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); res.end(); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "r`^/name/([\\w]+)/([\\w]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/name/smith/will");
        assert.equal(matches[0], "smith");
        assert.equal(matches[1], "will");
        res.end();
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); res.end(); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
        res.end();
    },
    "`503`": function(req, res, err) {
        try { assert.equal(req.url, "/throw-error"); }
        catch(e) {
            console.error(e.stack);
            console.error("Caused by:");
            console.error(err.stack);
            process.exit();
        }
        assert.equal(err.message, "503 should catch");
        res.end();
    }
});
router({ url: "/test?param=1&woo=2" }, mockResponse);
router({ url: "/throw-error" }, mockResponse);
router({ url: "/name/smith/will" }, mockResponse);
router({ url: "/random", triggerGeneric: true }, mockResponse);
router({ url: "/url-not-found" }, mockResponse);

router.add({ 
    "/ /home r`^/index(.php|.html|.xhtml)?$`": function(req, res) {
        assert.ok(req.url === "/" || req.url === "/index" || req.url === "/index.php" || req.url === "/home");
        res.end();
    }
});
router({ url: "/" }, mockResponse);
router({ url: "/index" }, mockResponse);
router({ url: "/index.php" }, mockResponse);
router({ url: "/home" }, mockResponse);

router.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); res.end(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); res.end(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); res.end(); }
    }
});
router({ url: "/method-test", method: "GET" }, mockResponse);
router({ url: "/method-test", method: "POST" }, mockResponse);
router({ url: "/method-test", method: "HEAD" }, mockResponse);

assert.equal(mockResponse.testCount, 0);