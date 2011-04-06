var assert = require("assert");
var bee = require("../");

var tests = {
    expected: 17,
    executed: 0,
    finished: function() { tests.executed++; }
}
var warnings = {};
console.warn = function(msg) { warnings[msg] = true; tests.finished(); };

var router = bee.route({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); tests.finished(); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "r`^/name/([\\w]+)/([\\w]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/name/smith/will");
        assert.equal(matches[0], "smith");
        assert.equal(matches[1], "will");
        tests.finished();
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); tests.finished(); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
        tests.finished();
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
        tests.finished();
    }
});
router({ url: "/test?param=1&woo=2" });
router({ url: "/throw-error" });
router({ url: "/name/smith/will" });
router({ url: "/random", triggerGeneric: true });
router({ url: "/url-not-found" });

router.add({ 
    "/ /home r`^/index(.php|.html|.xhtml)?$`": function(req, res) {
        assert.ok(req.url === "/" || req.url === "/index" || req.url === "/index.php" || req.url === "/home");
        tests.finished();
    }
});
router({ url: "/" });
router({ url: "/index" });
router({ url: "/index.php" });
router({ url: "/home" });

router.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); tests.finished(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); tests.finished(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); tests.finished(); }
    }
});
router({ url: "/method-test", method: "GET" });
router({ url: "/method-test", method: "POST" });
router({ url: "/method-test", method: "HEAD" });


// Testing warning messages
router.add({
    "/home": function() { },
    "r`^/name/([\\w]+)/([\\w]+)$`": function() { },
    "`404`": function() { },
    "`503`": function() { },
    "`not-a-valid-rule": function() { }
});

assert.ok(warnings["Duplicate beeline rule: /home"]);
assert.ok(warnings["Duplicate beeline rule: r`^/name/([\\w]+)/([\\w]+)$`"]);
assert.ok(warnings["Duplicate beeline rule: `404`"]);
assert.ok(warnings["Duplicate beeline rule: `503`"]);
assert.ok(warnings["Invalid beeline rule: `not-a-valid-rule"]);

assert.equal(tests.executed, tests.expected);