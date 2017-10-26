const Zombie = require('zombie');
const readline = require('readline-sync');
const config = require('./config');

const user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.20 (KHTML, like Gecko) Chrome/19.0.1036.7 Safari/535.20';

if (config.slackTeam == undefined) {
    console.err('slackTeam must be defined in config');
    process.exit(1);
}

(async function getToken() {
    const browser = new Zombie({ userAgent: user_agent, debug: false });
    var loggedIn = false;
    function extractToken() {
        console.log(browser.body.innerHTML.match(/api_token: ["']([a-z0-9\-]+)["']/)[1]);
        process.exit(0);
    }

    browser.on('error', (err) => {
        if (loggedIn) {
            // we don't need to run the Javascript after logging in
            extractToken();
        }
    });

    browser.visit('https://' + config.slackTeam + '.slack.com/account/profile', () => {
        var username = readline.question('Username: ');
        var password = readline.question('Password: ', { hideEchoBack: true });
        if (browser.querySelector('form[id=signin_form]') != null) {
            // normal slack signin
            browser.fill('input[id*=email]', username);
            browser.fill('input[id*=password]', password);
            submitLogin();
        } else {
            // external login, e.g. SSO or something, click the first link in the contents
            browser.clickLink('#page_contents a').then(() => {
                browser.wait().then(() => {
                    // zombie.js does not register forms by name on the document
                    for (var i = 0; i < browser.document.forms.length; i++) {
                        var form = browser.document.forms[i];
                        browser.document[form.name] = form;
                    }
                    // onLoad tags on the body don't fire correctly
                    let onLoadText = browser.document.body.getAttribute('onload') || browser.document.body.getAttribute('onLoad');
                    if (onLoadText != null) {
                        let injectedScript = browser.document.createElement("script");
                        injectedScript.setAttribute("type","text/javascript");
                        injectedScript.innerHTML = onLoadText;
                        browser.body.appendChild(injectedScript);
                    }
                    browser.wait().then(() => {
                        var usernameSelector = 'input[id*=email]';
                        if (browser.querySelector(usernameSelector) == null) {
                            usernameSelector = 'input[id*=username]';
                        }
                        browser.fill(usernameSelector, username);
                        browser.fill('input[id*=password]', password);
                        submitLogin();
                    });
                });
            });
        }
    });

    function submitLogin() {
        browser.document.forms[0].submit();
        loggedIn = true;
        browser.wait().then(() => {
            extractToken();
        });
    }
})();
