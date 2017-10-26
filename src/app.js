// Import dependencies
let nodecam       = require('node-webcam');
let sharp         = require('sharp');
let request       = require('request-promise');
let gm            = require('gm');
let sound         = require('play-sound')();
let imgToAscii    = require('image-to-ascii');
let os            = require('os');
let path          = require('path');
let fs            = require('fs');

// Import config, and establish defaults
var config;
try {
    config = require(path.join(os.homedir(), '.slack-cam-config'));
} catch(e) {
    config = require('./config');
}
if (config.slackApiToken == undefined) {
    // allow token to be loaded from separate file
    try {
        config.slackApiToken = require(path.join(os.homedir(), '.slack-cam-token')).slackApiToken;
    } catch(e) {
        console.err('slackApiToken cannot be required. ' +
                    'I tried to read it from $HOMEDIR/.slack-cam-config ' +
                    'and from $HOMEDIR/.slack-cam-token');
        process.exit(1);
    }
}
config.delay      = config.delay || 2.5;
config.frequency  = config.frequency || 5;
config.zoom       = config.zoom == undefined ? 475 : config.zoom;
config.crop       = config.crop == undefined ? true : config.crop;
config.brightness = config.brightness || 100;
config.store_file = config.store_file || false;

// Emit console log messages?
let verbose = config.verbose;

// Create a new cam instance;
let cam = nodecam.create({
    callbackReturn  : 'buffer'
    , output          : config.format || "png"
    , verbose         : config.verbose
    , device          : config.device
    , delay           : config.delay + " " + (config.extra_options || "")
    , bottomBanner    : config.banner == "bottom"
    , topBanner       : config.banner == "top"
    , width           : config.width || 1280
    , height          : config.height || 1024
});

if (verbose) {
    console.log("Config: %j", config);
}

// Let's get this party started!
let freq = config.frequency * 1000 * 60;
setInterval(captureImage, freq);
captureImage(); // Trigger immediately on load

////////////////////////////////////////////////////////////////////////////////

async function captureImage() {

    let buffer;
    let slackResponse;

    // Play a sound a few seconds before capture
    if (verbose) console.log('\n\nHere we go...');
    if (verbose) console.log('...say cheese!');
    try { await sound.play('shutter.mp3'); }
    catch (err) { console.error(err); }

    // Grab an image from the webcam
    if (verbose) console.log('...capturing image');
    try {   buffer = await capture(); }
    catch (err) { console.error(err); }

    // Enhance
    if (verbose) console.log('...enhancing');
    try { buffer = await enhance(buffer); }
    catch (err) { console.log(err); }

    // Zoom!
    if (config.zoom != false) {
        if (verbose) console.log('...squishing vertically');
        try { buffer = await zoom(buffer); }
        catch (err) { console.log(err); }
    }

    // // Crop!
    if (config.crop != false) {
        if (verbose) console.log('...cropping horizontally');
        try { buffer = await crop(buffer); }
        catch (err) { console.log(err); }
    }

    // Send the new image to Slack.
    if (verbose) console.log('...uploading to Slack');
    try { slackResponse = JSON.parse(await upload(buffer)); }
    catch (err) { console.error(err); }

    // optionally store the file
    if (config.store_file) {
        try {
            await fs.writeFile(Date.now() + ".jpg", buffer);
        } catch (err) {
            console.error(err);
        }
    }

    // Done!
    let imageUrl = slackResponse.profile.image_512;
    try { process.stdout.write(await showAsciiPic(imageUrl)); }
    catch (err) { console.error(err); }

    //////////////////////////////////////////////////////////////

    // Grab an image from the webcam
    async function capture() {
        return new Promise((resolve, reject) => {
            cam.capture('webcam', (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    }

    async function enhance(buffer) {
        return new Promise((resolve, reject) => {
            gm(buffer)
                .enhance()
                .modulate(config.brightness)
                .toBuffer((err, buffer, info) => {
                    if (err) reject(err);
                    else resolve(buffer);
                });
        });
    }

    // Crop the image vertically, to create a zoom effect
    async function zoom(buffer) {
        return sharp(buffer)
            .crop(sharp.gravity.center)
            .resize(1280, config.zoom)
            .toBuffer();
    }

    // Crop the image into a square, so it's avatar-shaped
    async function crop(buffer) {
        return sharp(buffer)
            .crop(sharp.strategy.entropy)
            .resize(500, 500)
            .jpeg({ quality: 40 })
            .toBuffer();
    }

    // Upload the image to Slack
    async function upload(buffer) {
        let endpoint = 'https://slack.com/api/users.setPhoto';
        let req = request.post(endpoint);
        let form = req.form();
        form.append('token', config.slackApiToken);
        form.append('image', buffer, {filename: 'me', contentType: 'image/jpg'});
        return req;
    }

    async function showAsciiPic(urlOrPath) {
        return new Promise((resolve, reject) => {
            let options = {
                size: { width: process.stdout.columns / 2, height: process.stdout.rows },
                size_options: { preserve_aspect_ratio: false }
            };

            imgToAscii(urlOrPath, options, (err, converted) => {
                if (err) reject(err);
                else resolve(converted);
            });
        });
    }
}
