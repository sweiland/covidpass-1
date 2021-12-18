const img = require("./img");
const consts = require("./constants");

exports.Payload = class {
  /*
   * For key descriptions, see: https://github.com/ehn-dcc-development/ehn-dcc-schema/blob/main/DCC.combined-schema.json
   */

  isValidDate(d) {
    return d instanceof Date && !isNaN(d);
  }

  formatDateString(dateString) {
    // Try to get date string into format "YYYY-MM-DDTHH:mm:ssZ"
    // so that Apple can parse as localized date
    if (dateString.length >= 10) {
      return dateString.substr(0, 10) + "T12:00:00Z";
    } else {
      var cutDateString = dateString.substr(0, 10);
      if (/^((19|20)\d\d(-\d\d){2})$/.test(cutDateString)) {
        // expects "YYY-MM-DD"
        return cutDateString + "T12:00:00Z";
      } else {
        // "dob" can also be in format "YYYY-MM", "YYYY" or empty
        return dateString;
      }
    }
  }

  constructor(body, valueSets) {
    const rawData = body["raw"];
    const decoded = body["decoded"];

    this.backgroundColor = "rgb(246,244,240)";
    this.labelColor = "rgb(77,149,84)";
    this.foregroundColor = "rgb(0,0,0)";
    this.icon = img.icon;
    this.icon2x = img.icon2x;
    this.logo = img.logo;
    this.logo2x = img.logo2x;

    this.raw = rawData;

    if (typeof rawData === "undefined") {
      throw new Error("No raw payload");
    }

    if (typeof decoded === "undefined") {
      throw new Error("No decoded payload");
    }

    const nam = decoded["-260"]["1"]["nam"];
    if (typeof nam === "undefined") {
      throw new Error("Failed to read name");
    }

    const firstName = nam["gn"];
    const lastName = nam["fnt"];

    this.name = lastName + ", " + firstName;

    const dob = decoded["-260"]["1"]["dob"];
    if (typeof dob === "undefined") {
      throw new Error("Failed to read date of birth");
    }

    this.dateOfBirth = this.formatDateString(dob);

    const innerData = decoded["-260"]["1"];

    if ("v" in innerData) {
      const vacc = innerData["v"][0];
      this.parseVaccinationData(vacc, valueSets);
    } else if ("t" in innerData) {
      const test = innerData["t"][0];
      this.parseTestData(test, valueSets);
    } else if ("r" in innerData) {
      const recovery = innerData["r"][0];
      this.parseRecoveryData(recovery, valueSets);
    } else {
      throw new Error("This certificate type is not supported");
    }
  }

  parseVaccinationData(v, valueSets) {
    if (typeof v === "undefined") {
      throw new Error("Failed to read vaccination information");
    }

    this.certificateType = consts.CERTIFICATE_TYPE.VACCINATION;

    /* General data */

    this.uvci = v["ci"];
    this.certificateIssuer = v["is"];

    const countryCodes = valueSets.countryCodes["valueSetValues"];
    const countryCode = v["co"];
    if (!(countryCode in countryCodes)) {
      throw new Error("Invalid country code");
    }
    this.country = countryCodes[countryCode].display;

    /* Vacc specific data */

    const doseIndex = v["dn"];
    const totalDoses = v["sd"];
    this.dose = doseIndex + "/" + totalDoses;
    this.dateOfVaccination = this.formatDateString(v["dt"]);

    const medicalProducts = valueSets.medicalProducts["valueSetValues"];

    const manufacturers = valueSets.manufacturers["valueSetValues"];

    const medicalProductKey = v["mp"];
    if (!(medicalProductKey in medicalProducts)) {
      throw new Error("Invalid medical product key");
    }

    this.medicalProductKey = medicalProductKey;

    const manufacturerKey = v["ma"];
    if (!(manufacturerKey in manufacturers)) {
      throw new Error("Invalid manufacturer");
    }

    this.vaccineName = medicalProducts[medicalProductKey].display;
    this.manufacturer = manufacturers[manufacturerKey].display;
  }

  parseTestData(t, valueSets) {
    if (typeof t === "undefined") {
      throw new Error("Failed to read test information");
    }
    this.certificateType = consts.CERTIFICATE_TYPE.TEST;

    /* General data */

    this.uvci = t["ci"];
    this.certificateIssuer = t["is"];

    const countryCodes = valueSets.countryCodes["valueSetValues"];
    const countryCode = t["co"];
    if (!(countryCode in countryCodes)) {
      throw new Error("Invalid country code");
    }
    this.country = countryCodes[countryCode].display;

    /* Test specific data */

    const testTypeId = t["tt"];
    const testTypes = valueSets.testTypes["valueSetValues"];
    if (!(testTypeId in testTypes)) {
      throw new Error("Invalid test type code:", testTypeId);
    }

    const testResultId = t["tr"];
    const testResults = valueSets.testResults["valueSetValues"];
    if (!(testResultId in testResults)) {
      throw new Error("Invalid test result code:", testResultId);
    }

    this.testType = testTypes[testTypeId].display;
    this.testResult = testResults[testResultId].display;
    this.testingTime = this.formatDateString(t["sc"]);

    console.log(this.testType, this.testResult);
  }

  parseRecoveryData(r, valueSets) {
    if (typeof r === "undefined") {
      throw new Error("Failed to read test information");
    }

    this.certificateType = consts.CERTIFICATE_TYPE.RECOVERY;

    /* General data */

    this.uvci = r["ci"];
    this.certificateIssuer = r["is"];

    const countryCodes = valueSets.countryCodes["valueSetValues"];
    const countryCode = r["co"];
    if (!(countryCode in countryCodes)) {
      throw new Error("Invalid country code");
    }
    this.country = countryCodes[countryCode].display;

    /* Recovery specific data */

    this.positiveTestedDate = this.formatDateString(r["fr"]);
    this.validFromDate = this.formatDateString(r["df"]);
    this.validUntilDate = this.formatDateString(r["du"]);
  }
};
