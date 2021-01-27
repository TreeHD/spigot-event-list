import request = require('request')
import cheerio = require('cheerio')
import fs = require('fs')
import yaml = require('js-yaml')
import {JavaDocUrl, AllClassesNoFrame, EventsYaml} from "./constants"
import {getEventSource} from "./get-type";

const main = () => {
    request(JavaDocUrl + AllClassesNoFrame, function (e, response, body) {
        if (e) {
            console.error(e)
        }

        try {
            // javadoc から イベント一覧を作成
            const $ = cheerio.load(body)
            const events = []
            $('a').each(function (_, element) {
                const a = $(element)
                const href = a.prop("href")
                if (href.endsWith('Event.html')) {
                    events.push({
                        name: href.substring(0, href.length - 5).split('/').pop(),
                        link: JavaDocUrl + href,
                        source: getEventSource(href)
                    })
                }
            })

            // events.yaml をロード
            const data = yaml.load(fs.readFileSync(EventsYaml, 'utf8'))

            // events.yaml に存在しない新しいイベントを追加
            const lastEventNames = data.map(value => value.name)
            events.forEach((event) => {
                if (!lastEventNames.includes(event.name)) {
                    data.push({
                        name: event.name,
                        link: event.link,
                        source: event.source,
                        description: ''
                    })
                }
            })

            // データを並び替え
            data.sort((a, b) => {
                if (a.name < b.name) {
                    return -1
                } else if (a.name > b.name) {
                    return 1
                } else {
                    return 0
                }
            })

            // events.yaml に保存
            fs.writeFile(EventsYaml, yaml.dump(data), 'utf8', (err) => {
                if (err) {
                    console.error(err.message);
                }
            })

        } catch (e) {
            console.error(e)
        }
    })
}

main()