// this file gets called after all jest tests have finished running.
// it is run in a sepeare context.
module.exports = async () => {
  console.info("jestTeardown called");

  // do something more interesting than this...
  await Promise.resolve();
};
