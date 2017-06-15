var request = require("request");
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("Homebridge – Door Lock", "HTTPLock", LockAccessory);
}

function LockAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.url = config["url"];
    this.lockID = config["lock-id"];
    this.username = config["username"];
    this.password = config["password"];

    this.lockservice = new Service.LockMechanism(this.name);

    this.lockservice
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));

    this.lockservice
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    this.battservice = new Service.BatteryService(this.name);

    this.battservice
        .getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBattery.bind(this));

    this.battservice
        .getCharacteristic(Characteristic.ChargingState)
        .on('get', this.getCharging.bind(this));

    this.battservice
        .getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getLowBatt.bind(this));

}

LockAccessory.prototype.getState = function(callback) {
    this.log("Getting current state...");

    request.get({
        url: this.url,
        qs: { username: this.username, password: this.password, lockid: this.lockID }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {
            var json = JSON.parse(body);
            var state = json.state; // "locked" or "unlocked"
            this.log("Lock state is %s", state);
            var locked = state == "locked"
                callback(null, locked); // success
        }
        else {
            this.log("Error getting state (status code %s): %s", response.statusCode, err);
            callback(err);
        }
    }.bind(this));
}

LockAccessory.prototype.getBattery = function(callback) {
    this.log("Getting current battery...");

    request.get({
        url: this.url,
        qs: { username: this.username, password: this.password, lockid: this.lockID }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {
            var json = JSON.parse(body);
            var batt = json.battery;
            this.log("Lock battery is %s", batt);
            callback(null, batt); // success
        }
        else {
            this.log("Error getting battery (status code %s): %s", response.statusCode, err);
            callback(err);
        }
    }.bind(this));
}

LockAccessory.prototype.getCharging = function(callback) {
    callback(null, Characteristic.ChargingState.NOT_CHARGING);
}

LockAccessory.prototype.getLowBatt = function(callback) {
    this.log("Getting current battery...");

    request.get({
        url: this.url,
        qs: { username: this.username, password: this.password, lockid: this.lockID }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {
            var json = JSON.parse(body);
            var batt = json.battery;
            this.log("Lock battery is %s", batt);
            var low = (batt > 20) ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
            callback(null, low); // success
        }
        else {
            this.log("Error getting battery (status code %s): %s", response.statusCode, err);
            callback(err);
        }
    }.bind(this));
}

LockAccessory.prototype.setState = function(state, callback) {
    var lockState = (state == Characteristic.LockTargetState.SECURED) ? "locked" : "unlocked";

    this.log("Set state to %s", lockState);

    request.post({
        url: this.url,
        form: { username: this.username, password: this.password, lockid: this.lockID, state: lockState }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {
            this.log("State change complete.");

            // we succeeded, so update the "current" state as well
            var currentState = (state == Characteristic.LockTargetState.SECURED) ?
                Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

            this.lockservice
                .setCharacteristic(Characteristic.LockCurrentState, currentState);

            var json = JSON.parse(body);
            var batt = json.battery;

            this.battservice
                .setCharacteristic(Characteristic.BatteryLevel, batt);

            callback(null); // success

            var self = this;
            setTimeout(function() {
                if (currentState == Characteristic.LockTargetState.UNSECURED) { 
                    self.lockservice
                        .setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
                }
            }, 5000);
        }
        else {
            this.log("Error '%s' setting lock state. Response: %s", err, body);
            callback(err || new Error("Error setting lock state."));
        }
    }.bind(this));
},

LockAccessory.prototype.getServices = function() {
    return [this.lockservice, this.battservice];
}
