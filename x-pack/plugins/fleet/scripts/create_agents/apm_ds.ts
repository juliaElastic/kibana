import fetch from 'node-fetch';

const ES_URL = 'http://localhost:9200';
const USERNAME = 'elastic';
const PASSWORD = 'changeme';


export async function run() {

    const auth = 'Basic ' + Buffer.from(USERNAME + ':' + PASSWORD).toString('base64');
    const res = await fetch(`${ES_URL}/_index_template/*-apm*`, {
      method: 'get',
      headers: {
        Authorization: auth,
      },
    });
    const data = await res.json();
    console.log("index templates: " + data.index_templates.length)

    const indexPatterns = [];
    for (let template of data.index_templates) {
        const indexPattern = template.index_template.index_patterns[0]
        indexPatterns.push(indexPattern)

        const ds = await fetch(`${ES_URL}/_data_stream/${indexPattern.split('*').join('default')}`, {
            method: 'put',
            headers: {
              Authorization: auth,
            },
          });
          const dsData = await ds.json();
          console.log("data stream created: " + JSON.stringify(dsData))
    }
    // console.log(indexPatterns)


    // const ds = await fetch(`${ES_URL}/_data_stream/*-apm*`, {
    //     method: 'get',
    //     headers: {
    //       Authorization: auth,
    //     },
    //   });
    //   const dsData = await ds.json();
    //   console.log("data streams: " + dsData.data_streams.length)
}