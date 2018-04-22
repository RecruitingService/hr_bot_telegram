const fs = require('fs');
const readline = require('readline');
const googleAuth = require('google-auth-library');
require('dotenv').config();

const TOKEN_PATH = `${__dirname}/sheets.googleapis.com-firsthr.json`;

// Load client secrets from a local file.

module.exports = {
    authorize
};
// fs.readFile('client_secret.json', function processClientSecrets(err, content) {
//     if (err) {
//         console.log('Error loading client secret file: ' + err);
//         return;
//     }
//     // Authorize a client with the loaded credentials, then call the
//     // Google Sheets API.
//     authorize(JSON.parse(content));
// });


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 */

function authorize(credentials) {
    const clientSecret = credentials.installed.client_secret;
    const clientId = credentials.installed.client_id;
    const redirectUrl = credentials.installed.redirect_uris[0];
    const auth = new googleAuth();
    const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    return new Promise((resolve, reject) => {
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) {
                return getNewToken(oauth2Client, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            }
            oauth2Client.credentials = JSON.parse(token);
            resolve(oauth2Client);
        })
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param callback The callback to call with the authorized
 *     client.
 */

function getNewToken(oauth2Client, callback) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: process.env.SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', code => {
        rl.close();
        oauth2Client.getToken(code, (err, token) => {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }

            oauth2Client.credentials = token;
            storeToken(token);
            callback(null, oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(__dirname);
    } catch (err) {
        if ('EEXIST' !== err.code) {
            throw err;
        }
    }

    fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err, doc) => {
        if (err) throw err;
    });
    console.log('Token stored to ' + TOKEN_PATH);
}