import * as sdk from 'maplibre-gl';
sdk.setWorkerUrl('/vendor/maplibre/' + sdk.getVersion() + '/maplibre-gl-worker.mjs');
export default sdk;
