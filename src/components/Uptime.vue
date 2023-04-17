<template>
    <span :class="className" :title="title">{{ uptime }}</span>
</template>

<script>
import { DOWN, MAINTENANCE, PENDING, UP } from "../util.ts";

export default {
    props: {
        /** Monitor this represents */
        monitor: {
            type: Object,
            default: null,
        },
        /** Type of monitor */
        type: {
            type: String,
            default: null,
        },
        /** Is this a pill? */
        pill: {
            type: Boolean,
            default: false,
        },
        /** Coloring by uptime value instead of lastHeartBeat */
        coloringByUptime: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        uptime() {
            if (this.type === "maintenance") {
                return this.$t("statusMaintenance");
            }

            let key = this.monitor.id + "_" + this.type;

            if (this.$root.uptimeList[key] !== undefined) {
                let result = Math.round(this.$root.uptimeList[key] * 10000) / 100;
                // Only perform sanity check on status page. See louislam/uptime-kuma#2628
                if (this.$route.path.startsWith("/status") && result > 100) {
                    return "100%";
                } else {
                    return result + "%";
                }
            }

            return this.$t("notAvailableShort");
        },

        color() {
            if (this.coloringByUptime) {
                let key = this.monitor.id + "_" + this.type;
                let uptime = this.$root.uptimeList[key];
                if (uptime !== undefined) {
                    if (uptime <= 100 && uptime >= 0.9999) {
                        return "full-green";
                    }
                    if (uptime < 0.9999 && uptime >= 0.999) {
                        return "light-green";
                    }
                    if (uptime < 0.999 && uptime >= 0.99) {
                        return "orange";
                    }
                    if (uptime < 0.99 && uptime >= 0) {
                        return "red";
                    }
                }

                return "empty";
            } else {
                if (this.lastHeartBeat.status === MAINTENANCE) {
                    return "maintenance";
                }

                if (this.lastHeartBeat.status === DOWN) {
                    return "danger";
                }

                if (this.lastHeartBeat.status === UP) {
                    return "primary";
                }

                if (this.lastHeartBeat.status === PENDING) {
                    return "warning";
                }

                return "secondary";
            }
        },

        lastHeartBeat() {
            if (this.monitor.id in this.$root.lastHeartbeatList && this.$root.lastHeartbeatList[this.monitor.id]) {
                return this.$root.lastHeartbeatList[this.monitor.id];
            }

            return {
                status: -1,
            };
        },

        className() {
            if (this.pill) {
                return `badge rounded-pill bg-${this.color}`;
            }

            return "";
        },

        title() {
            if (this.type === "720") {
                return `30${this.$t("-day")}`;
            }
            if (this.type === "8760") {
                return `365${this.$t("-day")}`;
            }

            return `24${this.$t("-hour")}`;
        }
    },
};
</script>

<style>
.badge {
    min-width: 62px;
}
</style>
