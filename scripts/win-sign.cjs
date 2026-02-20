const { execSync } = require("child_process");

exports.default = async function (configuration) {
  const thumbprint = process.env.CERTUM_CERT_SHA1;
  if (!thumbprint) {
    console.log(
      `  Skipping signing (no CERTUM_CERT_SHA1): ${configuration.path}`
    );
    return;
  }

  console.log(`  Signing: ${configuration.path}`);
  execSync(
    `signtool.exe sign /sha1 "${thumbprint}" /tr http://time.certum.pl /td sha256 /fd sha256 /v "${configuration.path}"`,
    { stdio: "inherit" }
  );
};
