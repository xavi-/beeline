var url = require("url");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var lru = require("lru-cache");

var getBuffer = (function() {
	var buffers = lru({ max: 1024 * 500, length: function(n) { return n.length; } });

	function watchBuffer(filePath) {
		if(buffers.has(filePath)) { return; }

		buffers.del(filePath);
		fs.watchFile(filePath, function() { buffers.del(filePath); });
	}

	return function getBuffer(filePath, callback) {
		if(buffers.has(filePath)) { return callback(null, buffers.get(filePath)); }

		fs.stat(filePath, function(err, stats) {
			if(err && err.code == "ENOENT") {
				return callback({ "file-not-found": true, path: filePath }, null);
			}

			if(err) { return callback(err, null); }

			if(!stats.isFile()) {
				return callback({ "not-a-file": true, path: filePath }, null);
			}

			fs.readFile(filePath, function(err, data) {
				if(err) { return callback(err, null); }

				watchBuffer(filePath);
				buffers.set(filePath, {
					data: data,
					sum: crypto.createHash("sha1").update(data).digest("hex")
				});
				callback(null, buffers.get(filePath));
			});
		});
	};
})();

function sendBuffer(req, res, mimeType, maxAge) {
	return function(err, buffer) {
		if(err) {
			if(err["file-not-found"]) {
				console.error("Could not find file: " + err.path);
				return default404(req, res);
			} else if(err["not-a-file"]) {
				console.error("Not a file: " + err.path);
				return default404(req, res);
			}

			throw err;
		}

		maxAge = maxAge || 31536000;

		res.removeHeader("Set-Cookie");
		res.setHeader("Cache-Control", "private, max-age=" + maxAge);
		res.setHeader("ETag", buffer.sum);

		if(req.headers["if-none-match"] === buffer.sum) {
			res.writeHead(304);
			return res.end();
		} else {
			res.writeHead(
				res.statusCode || 200,
				{ "Content-Length": buffer.data.length, "Content-Type": mimeType }
			);
			return res.end(buffer.data, "binary");
		}
	};
}

var staticFile = (function() {
	function handler(filePath, mimeType, req, res, maxAge) {
		getBuffer(filePath, sendBuffer(req, res, mimeType, maxAge));
	}

	return function staticFile(filePath, mime, maxAge) {
		return function(req, res) { handler(filePath, mime, req, res, maxAge); };
	};
})();

function staticDir(rootDir, mimeLookup, maxAge) {
	for(var key in mimeLookup) {
		if(key.charAt(0) !== ".") {
			console.warn("Extension found without a leading periond ('.'): '" + key + "'");
		}
	}

	return function(req, res, extra, matches) {
		matches = matches || extra;
		var filePath = path.join.apply(path, [ rootDir ].concat(matches));
		var ext = path.extname(filePath).toLowerCase();

		if(!(ext in mimeLookup)) {
			console.error("Unknown file extension -- file: " + filePath + "; extension: " + ext);
			return default404(req, res);
		}

		if(path.relative(rootDir, filePath).indexOf("..") !== -1) {
			console.error(
				"Attempted access to parent directory -- root: " + rootDir + "; subdir: " + filePath
			);
			return default404(req, res);
		}

		getBuffer(filePath, sendBuffer(req, res, mimeLookup[ext], maxAge));
	};
}

function default404(req, res, next) {
	if(next) { return next(); }

	var body = "404'd";
	res.writeHead(404, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);

	console.log("Someone 404'd: " + req.url);
}
function default405(req, res, next) {
	if(next) { return next(); }

	var body = "405'd";
	res.writeHead(405, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);

	console.log("Someone 405'd -- url: " + req.url + "; verb: " + req.method);
}
function default500(req, res, err, next) {
	if(next) { return next(err); }

	console.error("Error accessing: " + req.method + " " + req.url);
	console.error(err.message);
	console.error(err.stack);

	var body = [ "500'd" ];
	body.push("An exception was thrown while accessing: " + req.method + " " + req.url);
	body.push("Exception: " + err.message);
	body = body.join("\n");
	res.writeHead(500, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);
}

function findPattern(patterns, urlPath) {
	for(var i = 0, l = patterns.length; i < l; i++) {
		if(patterns[i].regex.test(urlPath)) {
			return {
				handler: patterns[i].handler,
				extra: patterns[i].regex.exec(urlPath).slice(1)
			};
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
	return function(req, res, vals, next) {
		var extra = Object.create(null);
		for(var i = 0; i < names.length; i++) {
			extra[names[i]] = decodeURIComponent(vals[i]);
		}
		executeHandler(handler, this, req, res, { extra: extra, vals: vals, next: next });
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


function executeHandler(handler, thisp, req, res, opts) {
	handler = (handler[req.method] || handler.any || handler);

	var extra = opts.extra, vals = opts.vals, next = opts.next;

	if(next) {
		if(extra && vals) { handler.call(thisp, req, res, extra, vals, next); }
		else if(extra) { handler.call(thisp, req, res, extra, next); }
		else { handler.call(thisp, req, res, next); }
	} else {
		if(extra && vals) { handler.call(thisp, req, res, extra, vals); }
		else if(extra) { handler.call(thisp, req, res, extra); }
		else { handler.call(thisp, req, res); }
	}
}
function expandHandler(handler) {
	if(handler.test) { // For `generic` type handlers
		handler.handler = expandHandler(handler.handler);
		return handler;
	}

	for(key in handler) {
		key.split(/\s+/).forEach(function(method) {
			handler[method] = handler[key];
		});
	}

	return handler;
}
function route(routes) {
	var preprocess = [], urls = Object.create(null), patterns = [], generics = [];
	var missing = default404, missingVerb = default405, error = default500;

	function handler(req, res, next) {
		try {
			var urlPath = url.parse(req.url).pathname;
			var info = (
				urls[urlPath] ||
				findPattern(patterns, urlPath) ||
				findGeneric(generics, req) ||
				missing
			);
			var handler = info.handler || info;
			var extra = info.extra;

			preprocess.forEach(function(process) { process(req, res); });

			executeHandler(handler, this, req, res, { extra: extra, next: next });
		} catch(err) {
			error.call(this, req, res, err, next);
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
					urls[rule] = expandHandler(handler);
				} else if(rule === "`404`" || rule === "`missing`" || rule === "`default`") {
					if(missing !== default404) { console.warn("Duplicate beeline rule: " + rule); }
					missing = expandHandler(handler);
				} else if(
					rule === "`405`" || rule === "`missing-verb`" || rule === "`missingVerb`"
				) {
					if(missingVerb !== default405) {
						console.warn("Duplicate beeline rule: " + rule);
					}
					missingVerb = expandHandler(handler);
				} else if(rule === "`500`" || rule === "`error`") {
					if(error !== default500) { console.warn("Duplicate beeline rule: " + rule); }
					error = expandHandler(handler);
				} else if(rule === "`generics`") {
					Array.prototype.push.apply(generics, handler.map(expandHandler));
				} else if(rRegExUrl.test(rule)) {
					var rRule = new RegExp(rRegExUrl.exec(rule)[1]);
					var cmpRegEx = function(p) { return p.regex.toString() === rRule.toString(); };
					if(patterns.some(cmpRegEx)) {
						console.warn("Duplicate beeline rule: " + rule);
					}
					patterns.push({ regex: rRule, handler: expandHandler(handler) });
				} else if(rToken.test(rule)) {
					var pattern = parseToken(rule, expandHandler(handler));
					var cmpPattern = function(p) {
						return p.regex.toString() === pattern.regex.toString();
					};
					if(patterns.some(cmpPattern)) {
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

exports.route = route;
exports.staticFile = staticFile;
exports.staticDir = staticDir;