// Maker interactions are dispatched centrally from index.js.
// Registering a second interactionCreate listener here caused every
// interaction to call the non-existent maker.isMakerCommand method.
// Keep this module as a no-op because handlers/interactions.js still loads it.
module.exports = function registerMakerInteractions() {};
