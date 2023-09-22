import { readFileSync } from 'fs';

export async function run() {
    const ds = readFileSync('/Users/juliabardi/Downloads/local-diagnostics-20230915-181747/settings.json', 'utf-8'); // apm_settings.txt'
    const dsJson = JSON.parse(ds)

    const updatedDataStreams: any = {};

    for (let key of Object.keys(dsJson)) {
        if (dsJson[key].settings.index.default_pipeline?.includes('8.9.2')) {
            updatedDataStreams[key.substring(4, key.length - 18)] = true
        }
    }

    // console.log(updatedDataStreams)

    const toUpdate = [];

    for (let key of Object.keys(dsJson)) {
        if (dsJson[key].settings.index.default_pipeline?.includes('8.8.2')) {
            // not updated
            const dsName = key.substring(4, key.length - 18)
            if (!updatedDataStreams[dsName]) {
                // console.log(dsName)
                toUpdate.push(dsName)
            }
        }
    }

    console.log(toUpdate)
    console.log('8.8.2: ' + toUpdate.length);
    console.log('8.9.2: ' + Object.keys(updatedDataStreams).length)

    // Object.keys(dsJson).sort().forEach(name => console.log(name))
}