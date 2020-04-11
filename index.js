const map = require("./map.json");

if(!process.argv[4] || process.argv[5]){
    console.error(`Usage: 
${process.argv[0]} ${process.argv[1]} [playlistID] [videoDir] [infoJSONFileDir]`);
    process.exit(1);
}
const id = process.argv[2];
const videoDir = process.argv[3];
const infoJsonFileDir = process.argv[4];

process.on("SIGINT", function() {
    fs.writeFileSync("./map.json", JSON.stringify(map));

    process.exit();
});

process.on("beforeExit", function() {
    fs.writeFileSync("./map.json", JSON.stringify(map));

    process.exit();
});

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code !== "EEXIST") {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) throw err;
        console.log("Token stored to " + TOKEN_PATH);
    });
}

const fs = require("fs");
const fsProm = require("fs").promises;
const readline = require("readline");
const {google} = require("googleapis");
const OAuth2 = google.auth.OAuth2;

const SCOPES = ["https://www.googleapis.com/auth/youtube"];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + "/.credentials/";
const TOKEN_PATH = TOKEN_DIR + "folder-to-youtube-playlist.json";

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const clientSecret = credentials.installed.client_secret;
    const clientId = credentials.installed.client_id;
    const redirectUrl = credentials.installed.redirect_uris[0];
    const oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES
    });
    console.log("Authorize this app by visiting this url: ", authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("Enter the code from that page here: ", function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log("Error while trying to retrieve access token", err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}


/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
const processAuth = async auth => {
    const service = google.youtube("v3");

    const data = await service.playlistItems.list({
        "part": "contentDetails",
        "playlistId": id,
        auth
    });

    map[id] = map[id] || [];
    const alreadyThere = data.data.items.map(item => item.contentDetails.videoId).concat(map[id]);

    let likes = await fsProm.readdir(videoDir);
    likes = likes.map(like => require(infoJsonFileDir + like.split(".").slice(0, -1).join(".") + ".info.json").id);
    const filtered = likes.filter(like => !alreadyThere.includes(like));

    console.log(`total: ${likes.length} new: ${filtered.length}`);

    try {
        for (const like of filtered) {
            console.log("adding " + like);
            await service.playlistItems.insert({
                part: "id,snippet",
                resource: {
                    snippet: {
                        playlistId: id,
                        resourceId: {
                            videoId: like,
                            kind: "youtube#video"
                        }
                    }
                },
                auth
            });
            map[id].push(like);
        }
        fs.writeFileSync("./map.json", JSON.stringify(map));
    }catch(e){
        console.error(e);
        fs.writeFileSync("./map.json", JSON.stringify(map));
    }
};

authorize(require("./client_id.json"), processAuth);
