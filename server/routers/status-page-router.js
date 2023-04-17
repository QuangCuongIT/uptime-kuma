let express = require("express");
const ExcelJS = require("exceljs");
const apicache = require("../modules/apicache");
const { UptimeKumaServer } = require("../uptime-kuma-server");
const StatusPage = require("../model/status_page");
const { allowDevAllOrigin, sendHttpError } = require("../util-server");
const { R } = require("redbean-node");
const Monitor = require("../model/monitor");
const dayjs = require("dayjs");

let router = express.Router();

let cache = apicache.middleware;
const server = UptimeKumaServer.getInstance();

router.get("/status/:slug", cache("5 minutes"), async (request, response) => {
    let slug = request.params.slug;
    await StatusPage.handleStatusPageResponse(response, server.indexHTML, slug);
});

router.get("/status", cache("5 minutes"), async (request, response) => {
    let slug = "default";
    await StatusPage.handleStatusPageResponse(response, server.indexHTML, slug);
});

router.get("/status-page", cache("5 minutes"), async (request, response) => {
    let slug = "default";
    await StatusPage.handleStatusPageResponse(response, server.indexHTML, slug);
});

// Status page config, incident, monitor list
router.get("/api/status-page/:slug", cache("5 minutes"), async (request, response) => {
    allowDevAllOrigin(response);
    let slug = request.params.slug;

    try {
        // Get Status Page
        let statusPage = await R.findOne("status_page", " slug = ? ", [
            slug
        ]);

        if (!statusPage) {
            return null;
        }

        let statusPageData = await StatusPage.getStatusPageData(statusPage);

        if (!statusPageData) {
            sendHttpError(response, "Not Found");
            return;
        }

        // Response
        response.json(statusPageData);

    } catch (error) {
        sendHttpError(response, error.message);
    }
});

router.get("/api/export/:slug", cache("1 minutes"), async (request, response) => {
    allowDevAllOrigin(response);

    try {
        let slug = request.params.slug;
        let statusPageID = await StatusPage.slugToID(slug);

        let monitorIDList = await R.getCol(`
            SELECT monitor_group.monitor_id FROM monitor_group, \`group\`
            WHERE monitor_group.group_id = \`group\`.id
            AND public = 1
            AND \`group\`.status_page_id = ?
        `, [
            statusPageID
        ]);

        const workbook = new ExcelJS.Workbook();

        for (let monitorID of monitorIDList) {
            let monitorName = await R.getCol(`
                SELECT monitor.name
                FROM monitor
                WHERE id = ?
            `, [
                monitorID
            ]);
            let sheet = workbook.addWorksheet(monitorName.toString());
            let uptimeList = await getUptimeLast365Days(monitorID);
            for (let i = uptimeList.length; i--;) {
                let uptimeItem = uptimeList[i];
                sheet.columns = [
                    { header: "Date",
                        key: "time",
                        width: 20 },
                    { header: "Uptime (%)",
                        key: "uptime",
                        width: 10 }
                ];

                let uptimeValue = null;
                if (uptimeItem.uptime !== null || uptimeItem.uptime !== undefined) {
                    uptimeValue = Math.round((uptimeItem.uptime * 100) * 100) / 100;
                }

                sheet.addRow({
                    time: uptimeItem.time,
                    uptime: uptimeValue
                });
            }
        }
        let fileName = "exportData.xlsx";

        response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=" + fileName);

        await workbook.xlsx.write(response);

        response.end();
    } catch (error) {
        sendHttpError(response, error.message);
    }
});

// Status Page Polling Data
// Can fetch only if published
router.get("/api/status-page/heartbeat/:slug", cache("1 minutes"), async (request, response) => {
    allowDevAllOrigin(response);

    try {
        let heartbeatList = {};
        let uptimeList = {};

        let slug = request.params.slug;
        let statusPageID = await StatusPage.slugToID(slug);

        let monitorIDList = await R.getCol(`
            SELECT monitor_group.monitor_id FROM monitor_group, \`group\`
            WHERE monitor_group.group_id = \`group\`.id
            AND public = 1
            AND \`group\`.status_page_id = ?
        `, [
            statusPageID
        ]);

        for (let monitorID of monitorIDList) {

            heartbeatList[monitorID] = await getUptimeLast365Days(monitorID);

            const type24 = 24;
            uptimeList[`${monitorID}_${type24}`] = await Monitor.calcUptime(type24, monitorID);
            const typeMonth = 24 * 30; // 720
            uptimeList[`${monitorID}_${typeMonth}`] = await Monitor.calcUptime(typeMonth, monitorID);
            const typeYear = 24 * 365; // 8760
            uptimeList[`${monitorID}_${typeYear}`] = await Monitor.calcUptime(typeYear, monitorID);
        }

        response.json({
            heartbeatList,
            uptimeList
        });

    } catch (error) {
        sendHttpError(response, error.message);
    }
});

// Status page's manifest.json
router.get("/api/status-page/:slug/manifest.json", cache("1440 minutes"), async (request, response) => {
    allowDevAllOrigin(response);
    let slug = request.params.slug;

    try {
        // Get Status Page
        let statusPage = await R.findOne("status_page", " slug = ? ", [
            slug
        ]);

        if (!statusPage) {
            sendHttpError(response, "Not Found");
            return;
        }

        // Response
        response.json({
            "name": statusPage.title,
            "start_url": "/status/" + statusPage.slug,
            "display": "standalone",
            "icons": [
                {
                    "src": statusPage.icon,
                    "sizes": "128x128",
                    "type": "image/png"
                }
            ]
        });

    } catch (error) {
        sendHttpError(response, error.message);
    }
});

/**
     * Calculate uptime for the last 365 days
     * @param {number} monitorID ID of monitor to calculate
     */
async function getUptimeLast365Days(monitorID) {
    // uptime by day
    let uptimeList = [];
    let date = dayjs.utc().startOf("day");
    let i = 365;
    while (i--) {
        let start = date.subtract(i, "day");
        let end = start.add(23, "hour").add(59, "minute").add(59, "second");

        let uptime = await Monitor.calcUptimeInTimeWindow(monitorID, start, end);
        uptimeList.push({
            msg: "",
            ping: 0,
            status: 1,
            time: start.format("YYYY-MM-DD HH:mm:ss").toString(),
            uptime: uptime,
        });
    }

    return uptimeList;
}

module.exports = router;
