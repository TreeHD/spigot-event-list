import requestPromise = require("request-promise");
import cheerio = require("cheerio");
import fs = require("fs");
import yaml = require("js-yaml");
import { EventSources, DataYamlName, getEventSource } from "./constants";
import { Event, EventSource, DataYamlType } from "./data-class";

const downloadEvents = async (
  events: { [name: string]: Event },
  lastEvents: { [name: string]: Event },
  eventSource: EventSource
) => {
  return requestPromise(
    eventSource.javadocUrl + eventSource.allClasses,
    (e, response, body) => {
      if (e) {
        console.error(e);
      }

      try {
        // javadoc から イベント一覧を作成
        const $ = cheerio.load(body);
        $("a").each((_, element) => {
          const a = $(element);
          const href = a.prop("href");
          if (href && href.endsWith("Event.html")) {
            const name = href
              .substring(0, href.length - 5)
              .split("/")
              .pop();
            const source = getEventSource(href);
            if (!eventSource.downloadSources.includes(source)) return;
            if (!events[name + source]) {
              const lastEvent = lastEvents[name + source];
              let description = "";
              let deprecateDescription;
              if (lastEvent) {
                description = lastEvent.description;
                deprecateDescription = lastEvent.deprecateDescription;
              }
              events[name + source] = {
                name: name,
                link: eventSource.javadocUrl + href,
                source: source,
                description: description,
                deprecateDescription: deprecateDescription,
              };
            }
          }
        });
      } catch (e) {
        console.error(e);
      }
    }
  );
};

const updateClassType = (
  events: { [name: string]: Event },
  eventSource: EventSource
) => {
  return requestPromise(
    eventSource.javadocUrl + eventSource.deprecateList,
    (e, response, body) => {
      if (e) {
        console.error(e);
      }

      try {
        // javadoc から イベント一覧を作成
        const $ = cheerio.load(body);
        $("#class .col-deprecated-item-name a").each((_, element) => {
          const a = $(element);
          const href = a.prop("href");
          if (href.endsWith("Event.html")) {
            const name = href
              .substring(0, href.length - 5)
              .split("/")
              .pop();
            const source = getEventSource(href);
            const event = events[name + source];
            if (event) {
              event.deprecate = true;
              if (!event.deprecateDescription) {
                event.deprecateDescription = "";
              }
            }
          }
        });
      } catch (e) {
        console.error(e);
      }
    }
  );
};

const main = async () => {
  // 前回のデータをロード
  const lastData = yaml.load(
    fs.readFileSync(DataYamlName, "utf8")
  ) as DataYamlType;
  const lastEventMap = lastData.events.reduce((map, value) => {
    map[value.name + value.source] = value;
    delete value.deprecate;
    return map;
  }, {} as { [name: string]: Event });

  // イベントをダウンロード
  const eventMap = {} as { [name: string]: Event };
  for (const source of Object.values(EventSources)) {
    await downloadEvents(eventMap, lastEventMap, source);
  }

  // イベントソースのバージョンを更新
  const versions = {} as { [name: string]: string };
  for (const [name, source] of Object.entries(EventSources)) {
    await source.updateVersion(source);
    versions[name] = source.version;
  }

  // 無視するイベントを除外
  lastData.excludeEvents.forEach((eventName) => {
    delete eventMap[eventName];
  });

  // イベントが非推奨かどうかを取得
  for (const source of Object.values(EventSources)) {
    await updateClassType(eventMap, source);
  }

  // データを並び替え
  const events = Object.keys(eventMap)
    .sort()
    .map((key): Event => {
      const value = eventMap[key];
      return {
        name: value.name,
        link: value.link,
        source: value.source,
        description: value.description,
        deprecate: value.deprecate,
        deprecateDescription: value.deprecateDescription,
      };
    });

  // イベント数を出力
  console.log(`総イベント数: ${events.length}`);
  console.log(
    `説明が書かれていないイベント数: ${
      events.filter((value) => !value.description).length
    }`
  );
  console.log(
    `非推奨イベント数: ${events.filter((value) => value.deprecate).length}`
  );
  console.log(
    `非推奨についての説明が書かれていないイベント数: ${
      events.filter((value) => value.deprecateDescription == "").length
    }`
  );

  // 保存するデータ
  const dumpData: DataYamlType = {
    versions,
    events,
    excludeEvents: lastData.excludeEvents,
  };

  // data.yaml に保存
  fs.writeFile(
    DataYamlName,
    yaml.dump(dumpData, {
      lineWidth: 200,
    }),
    "utf8",
    (err) => {
      if (err) {
        console.error(err.message);
      }
    }
  );
};

main();
