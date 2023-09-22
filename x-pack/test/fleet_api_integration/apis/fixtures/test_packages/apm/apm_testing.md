install 8.8.2 apm

cd /Users/juliabardi/kibana/kibana/x-pack/test/fleet_api_integration/apis/fixtures/test_packages/apm

curl -XPOST -H 'content-type: application/zip' -H 'kbn-xsrf: true' http://localhost:5601/julia/api/fleet/epm/packages -u elastic:changeme --data-binary @apm-8.8.2.zip

// generate data

curl -XPOST -H 'content-type: application/zip' -H 'kbn-xsrf: true' http://localhost:5601/julia/api/fleet/epm/packages -u elastic:changeme --data-binary @apm-8.9.2.zip

APM

packages/kbn-apm-synthtrace/src/scenarios

node scripts/synthtrace <scenario-file.ts>

# Like if you want to run the mobile data generation

node scripts/synthtrace mobile.ts
node scripts/synthtrace many_services.ts
node scripts/synthtrace high_throughput.ts
node scripts/synthtrace low_throughput.ts

// index 100k, 200k documents
node scripts/synthtrace  distributed_trace_long.ts --target https://elastic:RYwkw6aI4sELEjYkJ4I2I8az@jb-8-8-apm-upgrade-test.es.eastus2.staging.azure.foundit.no --live


create a test to prep data
restrict es resources?
rollover 20 ds didn't trigger timeout
reduce timeout?
manually set to installing or 

// could reproduce
reduce shards per node
https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html#_this_action_would_add_x_total_shards_but_this_cluster_currently_has_yz_maximum_shards_open 

local: 1 node
GET _cat/nodes?v=true

shards total: 160
GET _cluster/stats?filter_path=indices.shards.total

set max shards per node: 100
PUT _cluster/settings
{
  "persistent" : {
    "cluster.max_shards_per_node": 100
  }
}
GET _cluster/settings

next reinstall will fail on rollover - would reach max shards

 curl -sk -XPOST --user fleet_superuser:password -H 'content-type:application/json' \
      -H'x-elastic-product-origin:fleet' \
      http://localhost:9200/.kibana_ingest/_update/epm-packages:apm -d '
      {
         "doc": {
            "epm-packages":{
               "install_status": "installing",
               "install_version": "8.9.2"
            }
       }
      }'

We should find a way to run our tests at the same scale as our users. Many datastreams, many policies, etc..
Option 1: Expand the scale testing
Option 2: Work with the serverless long running deployment


[2023-09-21T14:10:00.428+02:00][INFO ][plugins.fleet] Mappings update for metrics-apm.app.synth-android-default failed due to ResponseError: illegal_argument_exception
        Root causes:
                illegal_argument_exception: unable to simulate template [metrics-apm.app.synth] that does not exist

GET _data_stream/metrics-apm.app.synth-android-default

{
  "data_streams": [
    {
      "name": "metrics-apm.app.synth-android-default",
      "template": "metrics-apm.app",

// unnecessary rollover - reaching shard count limit
[2023-09-21T15:13:33.090+02:00][DEBUG][plugins.fleet] Updating settings for metrics-apm.service_transaction.10m-1
[2023-09-21T15:13:33.091+02:00][INFO ][plugins.fleet] Mappings update for metrics-apm.app.default-default failed due to ResponseError: illegal_argument_exception
        Root causes:
                illegal_argument_exception: unable to simulate template [metrics-apm.app.default] that does not exist
[2023-09-21T15:13:33.092+02:00][INFO ][plugins.fleet] Triggering a rollover for metrics-apm.app.default-default      

[2023-09-21T15:13:33.153+02:00][WARN ][plugins.fleet] Failure to install package [apm]: [ResponseError: validation_exception
        Root causes:
                validation_exception: Validation Failed: 1: this action would add [2] shards, but this cluster currently has [283]/[100] maximum normal shards open;]

things to improve:
- so updates epm-packages refresh:false
- flag to disable rollovers
- throttle - is pmap enough?
- fail reason on so?
- states, last successful state
- log es requests performed


install all packages

 info ❌ lmd-1.0.2  took 19.689s : {"body":{"statusCode":500,"error":"Internal Server Error","message":"runtime_exception\n\tCaused by:\n\t\tmapper_parsing_exception: Failed to parse mapping: mapper [destination.ip] cannot be changed from type [ip] to [keyword]\n\tRoot causes:\n\t\truntime_exception: Could not create destination index [ml-rdp-lmd-1.0.2] for transform [logs-lmd.pivot_transform-default-1.0.2]"},"status":500,"took":19.689,"didError":true}
 info ❌ redisenterprise-0.5.0  took 15.821s : {"body":{"statusCode":500,"error":"Internal Server Error","message":"mapper_parsing_exception\n\tCaused by:\n\t\tillegal_argument_exception: No field type matched on [float], possible values are [object, string, long, double, boolean, date, binary]\n\tRoot causes:\n\t\tmapper_parsing_exception: Failed to parse mapping: No field type matched on [float], possible values are [object, string, long, double, boolean, date, binary]"},"status":500,"took":15.821,"didError":true}
 info ❌ zscaler-0.1.2  took 0.331s : {"body":{"statusCode":400,"error":"Bad Request","message":"Invalid top-level package manifest at top-level directory zscaler-0.1.2 (package name: zscaler): one or more fields missing of name, version, description, title, format_version, owner."},"status":400,"took":0.331,"didError":true}