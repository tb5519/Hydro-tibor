// An opaque-origin classroom iframe cannot use persistent browser storage.
// OneByOne's authenticated project save is the only persistence mechanism.
const requestPersistentStorage = () => {};
const gentlyRequestPersistentStorage = () => {};
export {requestPersistentStorage, gentlyRequestPersistentStorage};
