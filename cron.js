const CronJob = require('cron').CronJob;
const { authorize } = require('./googleAuthorization');
require('dotenv').config();
const { getAllRows } = require('./googleQueris');
const fs = require('fs');
const request = require('request');
const moment = require('moment');
const _ = require('lodash');
const texts = require('./texts/common');
global.globalObject = {};

const cronContext = {
    onTick: function() {
        fs.readFile('client_secret.json', (err, content) => {
            if (err) {
                console.log('Error loading client secret file: ' + err);
                return;
            }

            // Authorize a client with the loaded credentials, then call the Google Sheets API.
            authorize(JSON.parse(content))
                .then(doc => {
                    const today = moment(new Date()).format('DD/MM/YYYY');
                    getAllRows(doc)
                        .then(data => {
                            const array = [];
                            let index;
                            for (let i = 1; i < data.length; i++) {
                                let row = data[i];
                                if (today === row[0]) {
                                    row.push(1 + i);
                                    globalObject[row[9]] = row;
                                    array.push(row);
                                }
                            }
                            if (!_.isEmpty(array)) {
                                index = array.length - 1;
                                recursiveSendMessage(array[index])
                            }

                            function recursiveSendMessage(row) {
                                const CHATID=row[9];
                                const URL=`https://api.telegram.org/bot${row[10]}/sendMessage`;
                                const TEXT=`Добрый день, Вам назначено собеседование на ${row[1]} ${row[0]}`;
                                const keyboard = {
                                    keyboard: [
                                        [
                                            {"text": texts.yesAnswer},
                                            {"text": texts.noAnswer}
                                        ]
                                    ],
                                    one_time_keyboard: true,
                                    // resize_keyboard: true
                                };
                                request.post(URL, {form: {
                                    chat_id: CHATID,
                                    disable_web_page_preview: 1,
                                    text: TEXT,
                                    reply_markup: JSON.stringify(keyboard)
                                }}, function(error, response, body){
                                    if (error) {
                                        console.error(error)
                                    }
                                    if (0 < index) {
                                        recursiveSendMessage(array[--index])
                                    }
                                });
                            }
                        });
                })
                .catch(console.error)
        });
    },
    start: false,
    timeZone: 'Europe/Moscow'
};

const job = new CronJob({
    cronTime: '00 10 15 * * 0-6',
    ...cronContext
});

const job2 = new CronJob({
    cronTime: '00 30 12 * * 0-6',
    ...cronContext
});


job.start();
job2.start();