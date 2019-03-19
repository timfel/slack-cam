const Horseman = require('node-horseman');
const readline = require('readline-sync');
const config = require('./config');
const urlmod = require('url');
const path = require('path');
const fs = require('fs');

const user_agent = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:56.0) Gecko/20100101 Firefox/56.0';

if (config.slackTeam == undefined) {
    console.err('slackTeam must be defined in config');
    process.exit(1);
}

process.env['DEBUG'] = 'horseman';

process.on('unhandledRejection', error => {
    if (error.message.match(/Failed to load url/)) {
        // pass
    } else {
        console.log('unhandled rejection', error.message);
    }
});

const appdir = path.join(__filename, '..', '..');
const horsemanOptions = {injectJquery: false, interval: 500, loadImages: false};
for (var dir of fs.readdirSync(appdir)) {
    if (dir.match(/^phantomjs/)) {
        let potentialPath = path.join(dir, 'bin', 'phantomjs');
        if (fs.existsSync(potentialPath)) {
            console.log('Using "' + potentialPath + '"');
            horsemanOptions['phantomPath'] = potentialPath;
            break;
        }
    }
}

async function getToken() {
    let username = readline.question('Username: ');
    let password = readline.question('Password: ', { hideEchoBack: true });
    let url = 'https://' + config.slackTeam + '.slack.com/account/profile';

    const page = new Horseman(horsemanOptions);
    page.userAgent(user_agent);

    var resolveFunction;
    let returnPromise = new Promise(resolve => {
        resolveFunction = resolve;
    });

    var wasResolved = false;
    async function extractToken(text) {
        if (text) {
            let match = text.match(/api_token: ["']([a-z0-9\-]*)["']/);
            if (!match) {
                match = text.match(/["']api_token["']\s*:\s*["'](xoxs-[a-z0-9\-]*)["']/);
            }
            if (match) {
                let token = match[1];
                if (token && !wasResolved) {
                    wasResolved = true;
                    console.log("Token: " + token);
                    resolveFunction(token);
                    await page.close();
                }
            } else {

            }
        }
    }

    function checkNextLoads() {
        // XXX: Sometimes parts of the load may fail, so we try to continue
        // nonetheless and just check anything the gets loaded from now on
        page.on('loadFinished', (status) => {
            if (status == "success") {
                page.html().then(extractToken).catch(e => {
                    console.log(e);
                });
            }
        });
    }

    let exists = await page.open(url).exists('form[id=signin_form]');
    var usernameSelector = 'input[id*=email]';
    if (!exists) {
        // external login, e.g. SSO or something, click the first link in
        // the contents, then try to fill in the SSO credentials
        let pwexists = await page.click('#page_contents a')
            .waitForSelector('input[id*=password]', {timeout: 5000})
            .exists(usernameSelector);
        if (!pwexists) {
            usernameSelector = 'input[id*=username]';
        }
    }
    checkNextLoads();
    try {
        await page.type(usernameSelector, username)
            .type('input[id*=password]', password)
            .evaluate(function() { document.forms[0].submit(); });
    } catch (e) { }

    return returnPromise;
}

if (require.main === module) {
    (async function main() {
        console.log(await getToken());
    })();
} else {
    module.exports = getToken;
}
