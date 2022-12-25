"use strict";
exports.__esModule = true;
var needle = require("needle");
var url = process.env.LIFESHEET_JSON_URL;
if (url) {
    console.log("Loading remote JSON config...");
    needle.get(url, function (error, response, body) {
        var userConfig = body;
        console.log("Successfully loaded remote user config");
        module.exports.userConfig = userConfig;
    });
}
else {
    var userConfig = require("../../lifesheet.json");
    console.log("Successfully loaded user config");
    module.exports.userConfig = userConfig;
}
//# sourceMappingURL=config.js.map