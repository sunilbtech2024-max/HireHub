const express = require("express");
const { getExternalJobs } = require("../controllers/externalJobController");

const router = express.Router();

router.get("/", getExternalJobs);

module.exports = router;
