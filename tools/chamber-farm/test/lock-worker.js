"use strict";

const { acquireLock } = require("../state");

acquireLock(process.argv[2]).then(() => {
    process.send("locked");
    setInterval(() => {}, 1000);
}).catch(() => {
    process.send("failed");
    process.exitCode = 1;
});
