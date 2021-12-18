"use strict";

const utils = require("./utils");
const consts = require("./constants");

const { Payload, CertificateType } = require("./payload");
const { toBuffer } = require("do-not-zip");
const crypto = require("crypto");

exports.createPass = async function (data) {
  /* Functions */

  function randomId(length) {
    var result = "";
    var characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  function getBufferHash(buffer) {
    // creating hash
    const sha = crypto.createHash("sha1");
    sha.update(buffer);
    return sha.digest("hex");
  }

  function isAppleParsableDateString(dateString) {
    return /^([0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-4]|1[0-9]|0[0-9]):[0-6][0-9]:[0-6][0-9]Z$/.test(
      dateString
    );
  }

  function getStringField(key, value, translateKey, isAlignedRight) {
    let textAlignment = "PKTextAlignmentRight";
    if (key === "exp") {
      textAlignment = "PKTextAlignmentRight";
    } else if (key === "dov") {
      textAlignment = "PKTextAlignmentCenter";
    } else if (!isAlignedRight) {
      textAlignment = "PKTextAlignmentLeft";
    }
    return {
      key: key,
      value: value,
      label: window.$nuxt.$t(translateKey),
      textAlignment,
    };
  }

  function getDateField(key, value, translateKey, isAlignedRight) {
    var field = getStringField(key, value, translateKey, isAlignedRight);
    field["dateStyle"] = "PKDateStyleMedium";
    field["timeStyle"] = "PKDateStyleNone";
    field["ignoresTimeZone"] = true;
    return field;
  }

  async function signPassWithRemote(pass, payload) {
    // From pass-js
    // https://github.com/walletpass/pass-js/blob/2b6475749582ca3ea742a91466303cb0eb01a13a/src/pass.ts

    // Creating new Zip file
    const zip = [];

    // Adding required files
    // Create pass.json
    zip.push({ path: "pass.json", data: Buffer.from(JSON.stringify(pass)) });
    zip.push({ path: "icon.png", data: payload.icon });
    zip.push({ path: "icon@2x.png", data: payload.icon2x });
    zip.push({ path: "logo.png", data: payload.logo });
    zip.push({ path: "logo@2x.png", data: payload.logo2x });

    // adding manifest
    const manifestJson = JSON.stringify(
      zip.reduce((res, { path, data }) => {
        res[path] = getBufferHash(data);
        return res;
      }, {})
    );
    zip.push({ path: "manifest.json", data: manifestJson });

    const response = await fetch("/api/sign", {
      method: "POST",
      headers: {
        Accept: "application/octet-stream",
        "Content-Type": "application/json",
      },
      body: manifestJson,
    });

    if (response.status !== 200) {
      console.error(response);
      return undefined;
    }

    const manifestSignature = await response.arrayBuffer();

    zip.push({ path: "signature", data: Buffer.from(manifestSignature) });

    // finished!
    return toBuffer(zip);
  }

  function getExpDate(date) {
    const vaxDate = new Date(date);
    vaxDate.setDate(vaxDate.getDate() + 270);
    return vaxDate.toISOString();
  }

  function createPassSecondaryAndAuxiliaryFields(payload) {
    if (payload.certificateType == consts.CERTIFICATE_TYPE.VACCINATION) {
      return {
        secondaryFields: [
          getStringField("dose", payload.dose, "pass.dose", false),
          getDateField(
            "dov",
            payload.dateOfVaccination,
            "pass.dateOfVaccination",
            false
          ),
          getDateField(
            "exp",
            getExpDate(payload.dateOfVaccination),
            "pass.validUntil",
            true
          ),
        ],
        auxiliaryFields: [
          getStringField("vaccine", payload.vaccineName, "pass.vaccine", false),
          getDateField("dob", payload.dateOfBirth, "pass.dateOfBirth", true),
        ],
      };
    } else if (payload.certificateType == consts.CERTIFICATE_TYPE.TEST) {
      return {
        secondaryFields: [
          getStringField("testType", payload.testType, "pass.testType", false),
          getStringField(
            "testResult",
            payload.testResult,
            "pass.testResult",
            true
          ),
        ],
        auxiliaryFields: [
          getDateField(
            "testingTime",
            payload.testingTime,
            "pass.testingTime",
            false
          ),
          getDateField("dob", payload.dateOfBirth, "pass.dateOfBirth", true),
        ],
      };
    } else if (payload.certificateType == consts.CERTIFICATE_TYPE.RECOVERY) {
      return {
        secondaryFields: [
          getDateField(
            "validFrom",
            payload.validFromDate,
            "pass.validFrom",
            false
          ),
          getDateField(
            "validUntil",
            payload.validUntilDate,
            "pass.validUntil",
            true
          ),
        ],
        auxiliaryFields: [
          getDateField(
            "firstPositiveTested",
            payload.positiveTestedDate,
            "pass.positiveTested",
            false
          ),
          getDateField("dob", payload.dateOfBirth, "pass.dateOfBirth", true),
        ],
      };
    }
  }

  /* Execution */

  let valueSets;

  try {
    valueSets = await utils.getValueSets();
  } catch (e) {
    console.error(e);
    return undefined;
  }

  let payload;

  try {
    payload = new Payload(data, valueSets);
  } catch (e) {
    console.error("Extracting payload failed:", e);
    return undefined;
  }

  const qrCode = {
    message: payload.raw,
    format: "PKBarcodeFormatQR",
    messageEncoding: "utf-8",
  };

  const passName = "COVID Pass";
  const serialNumber = payload.uvci + randomId(8); // TODO: Create serialNumber from hash
  const passSpecificFields = createPassSecondaryAndAuxiliaryFields(payload);

  const pass = {
    passTypeIdentifier: window.$nuxt.$config.passIdentifier,
    teamIdentifier: window.$nuxt.$config.teamIdentifier,
    sharingProhibited: true,
    voided: false,
    formatVersion: 1,
    logoText: passName,
    organizationName: passName,
    description: passName,
    labelColor: payload.labelColor,
    foregroundColor: payload.foregroundColor,
    backgroundColor: payload.backgroundColor,
    serialNumber: serialNumber,
    barcodes: [qrCode],
    barcode: qrCode,
    expirationDate: getExpDate(payload.dateOfVaccination),
    generic: {
      headerFields: [
        {
          key: "type",
          label: window.$nuxt.$t("pass.certificateType.label"),
          value: window.$nuxt.$t(
            `pass.certificateType.${payload.certificateType.toLowerCase()}`
          ),
        },
      ],
      primaryFields: [
        {
          key: "name",
          label: window.$nuxt.$t("pass.name"),
          value: payload.name,
        },
      ],
      secondaryFields: passSpecificFields.secondaryFields,
      auxiliaryFields: passSpecificFields.auxiliaryFields,
      backFields: [
        {
          key: "uvci",
          label: window.$nuxt.$t("pass.uniqueCertificateIdentifier"),
          value: payload.uvci,
        },
        {
          key: "issuer",
          label: window.$nuxt.$t("pass.certificateIssuer"),
          value: payload.certificateIssuer,
        },
        {
          key: "country",
          label: window.$nuxt.$t("pass.country"),
          value: payload.country,
        },
        {
          key: "disclaimer",
          label: window.$nuxt.$t("pass.disclaimer.label"),
          value: window.$nuxt.$t("pass.disclaimer.value"),
        },
        {
          key: "credits",
          label: window.$nuxt.$t("pass.credits.label"),
          value: window.$nuxt.$t("pass.credits.value"),
        },
      ],
    },
  };

  return await signPassWithRemote(pass, payload);
};
