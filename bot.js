const Telegraf = require('telegraf');
const fs = require('fs');
require('./cron');
const session = require('telegraf/session');
const Markup = require('telegraf/markup');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const Extra = require('telegraf/extra');
const { authorize } = require('./googleAuthorization');
const { addRow, getRows, updateRow, getAllRows } = require('./googleQueris');
const Moment = require('moment');
const MomentRange = require('moment-range');
const _ = require('lodash');
const moment = MomentRange.extendMoment(Moment);
require('dotenv').config();
const texts = require('./texts/common');
const responses = require('./texts/responses');
const { enter, leave } = Stage;
const globalObj = {};

const phoneScene = new Scene('phone');
phoneScene.enter(ctx => {
    return ctx.reply(texts.howToConnect, Extra.markup((markup) => {
        return markup.resize()
            .keyboard([
                markup.contactRequestButton(texts.answerButton),
            ])
    }))
});
phoneScene.on('message', ctx => {
    if (ctx.message.contact) {
        globalObj[ctx.message.chat.id] = {
            id: ctx.message.chat.id
        };
        globalObj[ctx.message.chat.id].phone = ctx.message.contact.phone_number;
        globalObj[ctx.message.chat.id].fullname = `${ctx.message.from.first_name || ""} ${ctx.message.from.last_name || ""}`;
        return ctx.scene.enter('start');
    }
    return ctx.reply(texts.howToConnect, Extra.markup((markup) => {
        return markup.resize()
            .keyboard([
                markup.contactRequestButton(texts.answerButton),
            ])
    }))
});

/**
 * Start Scene
 * @type {BaseScene}
 */

const startScene = new Scene('start');
startScene.enter(ctx => {
    const time = moment.unix(ctx.update.message.date).format();
    let firstDay, secondDay;
    switch (moment(time).isoWeekday()) {
        case 4:
            firstDay = moment(time).add(1, 'day').format('DD/MM/YYYY');
            secondDay = moment(time).add(4, 'day').format('DD/MM/YYYY');
            break;
        case 5:
            firstDay = moment(time).add(3, 'day').format('DD/MM/YYYY');
            secondDay = moment(time).add(4, 'day').format('DD/MM/YYYY');
            break;
        case 6:
            firstDay = moment(time).add(2, 'day').format('DD/MM/YYYY');
            secondDay = moment(time).add(3, 'day').format('DD/MM/YYYY');
            break;
        default:
            firstDay = moment(time).add(1, 'day').format('DD/MM/YYYY');
            secondDay = moment(time).add(2, 'day').format('DD/MM/YYYY');
            break;
    }
    startScene.action(firstDay, ctx => {
        globalObj[ctx.update.callback_query.from.id].day = firstDay;
        ctx.scene.enter('day')
    });
    startScene.action(secondDay, ctx => {
        globalObj[ctx.update.callback_query.from.id].day = secondDay;
        ctx.scene.enter('day')
    });
    return ctx.reply(texts.chooseDay, Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton(firstDay, firstDay),
            m.callbackButton(secondDay, secondDay)
        ])))
});
startScene.on('message', ctx => ctx.reply(texts.dayDefValue));

/**
 * Day Scene
 */
const dayScene = new Scene('day');
const time = ['утро', 'день', 'вечер'];
function makeTwentyMinutes(ctx, i, type) {

    const from = moment(responses[ctx.tg.token].ranges[i][0].toString(), 'h').format();
    const till = moment(responses[ctx.tg.token].ranges[i][1].toString(), 'h').format();
    const range = moment.range(from, till);
    const hours = Array.from(range.by('minutes', { step: responses[ctx.tg.token].timeGap })).map(one => one.format('HH:mm'));
    const resultArr = [];

    return new Promise((resolve, reject) => {
        if (type) {
            return resolve(hours)
        }

        fs.readFile('client_secret.json', (err, content) => {
            if (err) {
                console.log('Error loading client secret file: ' + err);
                return;
            }

            // Authorize a client with the loaded credentials, then call the Google Sheets API.
            authorize(JSON.parse(content))
                .then(doc => {
                    getRows(doc, globalObj[ctx.update.callback_query.from.id].day, ctx.tg.token)
                        .then(doc => {
                            _.each(doc, one => {
                                const found = _.find(hours, two => one === two);
                                if (found) {
                                    hours.splice(hours.indexOf(found), 1);
                                }
                            });
                            hours.forEach(one => {
                                resultArr.push(Markup.callbackButton(one, one));
                            });
                            return resolve(_.chunk(resultArr, resultArr.length/3));
                        })
                        .catch(console.error)
                })
                .catch(console.error)
        });
    });

}

dayScene.enter((ctx) => {
    return ctx.reply(texts.chooseRange, Extra.markup(m =>
        m.inlineKeyboard([
            m.callbackButton(time[0], time[0]),
            m.callbackButton(time[1], time[1]),
            m.callbackButton(time[2], time[2])
        ])))

});
dayScene.action(time, ctx => {
    globalObj[ctx.update.callback_query.from.id].time = ctx.match;
    ctx.scene.enter('time');
});
dayScene.command('cancel', leave());
dayScene.on('message', (ctx) => ctx.reply(texts.chooseRange));

/**
 * Time Scene
 */

const timeScene = new Scene('time');
timeScene.enter(ctx => {
    makeTwentyMinutes(ctx, time.indexOf(globalObj[ctx.update.callback_query.from.id].time), true)
        .then(doc => {
            timeScene.action(doc, ctx => {
                globalObj[ctx.update.callback_query.from.id].hour = ctx.match;
                ctx.scene.leave();
            });
        }).catch(console.error);
    makeTwentyMinutes(ctx, time.indexOf(globalObj[ctx.update.callback_query.from.id].time))
        .then(doc => {
            return ctx.reply(texts.timeDefValue,
                Markup
                    .inlineKeyboard(doc)
                    .extra()
            )
        })

});
timeScene.leave(ctx => {
    fs.readFile('client_secret.json', (err, content) => {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return;
        }

        // Authorize a client with the loaded credentials, then call the Google Sheets API.
        authorize(JSON.parse(content))
            .then(doc => {
                getAllRows(doc)
                    .then(data => {
                        const array = [];
                        let index = 0;
                        for (let i = 1; i < data.length; i++) {
                            let row = data[i];
                            if (globalObj[ctx.update.callback_query.from.id].id.toString() === row[9]) {
                                index = ++i;
                                array.push(row);
                            }
                        }
                        if (_.isEmpty(array)) {
                            addRow(doc, [
                                globalObj[ctx.update.callback_query.from.id].day, globalObj[ctx.update.callback_query.from.id].hour, null,
                                globalObj[ctx.update.callback_query.from.id].fullname,
                                globalObj[ctx.update.callback_query.from.id].phone, null, null, 'в процессе', null,
                                globalObj[ctx.update.callback_query.from.id].id],
                                ctx.tg.token
                                )
                                .then(doc => {
                                    ctx.reply(responses[ctx.tg.token].sendInvitationText(globalObj[ctx.update.callback_query.from.id].day, globalObj[ctx.update.callback_query.from.id].hour));
                                    delete globalObj[ctx.update.callback_query.from.id];
                                })
                                .catch(console.error);
                            return;
                        }

                        updateRow(doc, [globalObj[ctx.update.callback_query.from.id].day, globalObj[ctx.update.callback_query.from.id].hour, null,
                                globalObj[ctx.update.callback_query.from.id].fullname, globalObj[ctx.update.callback_query.from.id].phone, null, null, 'в процессе', null,
                                globalObj[ctx.update.callback_query.from.id].id, ctx.tg.token]
                            , `A${index}:K${index}`)
                            .then(doc => {
                                ctx.reply(responses[ctx.tg.token].sendInvitationText(globalObj[ctx.update.callback_query.from.id].day, globalObj[ctx.update.callback_query.from.id].hour));
                                delete globalObj[ctx.update.callback_query.from.id];
                            })
                            .catch(console.error);
                    });


            })
            .catch(console.error)
    });
});
timeScene.on('message', ctx => ctx.reply(texts.timeDefValue));

function createBot(token) {
    const bot = new Telegraf(token);
    const stage = new Stage([startScene, dayScene, timeScene, phoneScene]);
    bot.use(session());
    bot.use(stage.middleware());
    bot.use(Telegraf.log());
    bot.command('start', enter('phone'));
    bot.hears(texts.yesAnswer, ctx => {
        ctx.reply(texts.afterYes);
        const key = ctx.message.chat.id.toString();
        const rowInfo = globalObject[key];
        fs.readFile('client_secret.json', (err, content) => {
            if (err) {
                console.log('Error loading client secret file: ' + err);
                return;
            }
            authorize(JSON.parse(content))
                .then(doc => {
                    getAllRows(doc)
                        .then(data => {
                            let rowNumber = 0;
                            for (let i = 1; i < data.length; i++) {
                                let row = data[i];
                                if (key === row[9]) rowNumber = 1 + i;
                            }
                            updateRow(doc, ['согласен'], `H${rowNumber}`)
                                .then(() => delete globalObject[key])
                                .catch(console.error)
                        });
                })
                .catch(console.error)
        });
    });
    bot.hears(texts.noAnswer, ctx => {
        ctx.reply(texts.afterNo);
        const key = ctx.message.chat.id.toString();
        const rowInfo = globalObject[key];
        fs.readFile('client_secret.json', (err, content) => {
            if (err) {
                console.log('Error loading client secret file: ' + err);
                return;
            }

            // Authorize a client with the loaded credentials, then call the Google Sheets API.
            authorize(JSON.parse(content))
                .then(doc => {
                    getAllRows(doc)
                        .then(data => {
                            let rowNumber = 0;
                            for (let i = 1; i < data.length; i++) {
                                let row = data[i];
                                if (key === row[9]) rowNumber = 1 + i;
                            }
                            updateRow(doc, ['отменен'], `H${rowNumber}`)
                                .then(() => delete globalObject[key])
                                .catch(console.error)
                        });

                })
                .catch(console.error)
        });
    });
    bot.on('message', ctx => {
        const key = ctx.message.chat.id.toString();
        if (globalObject[key]) {
            return ctx.reply(texts.notificationMsg, Markup
                .keyboard([
                    [
                        {"text": texts.yesAnswer},
                        {"text": texts.noAnswer}
                    ]
                ])
                .oneTime()
                .extra()
            )
        }

        ctx.reply(texts.activation)
    });
    bot.action(/.+/, ctx => ctx.reply(texts.activation));
    bot.startPolling();
}

createBot(process.env.BOT_TOKEN_1);
createBot(process.env.BOT_TOKEN_2);
createBot(process.env.BOT_TOKEN_INFINITI);

