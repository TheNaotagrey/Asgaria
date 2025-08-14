const { performTransaction } = require('../transactions');

function consumeResources(db, seigneurieId, costs, cb) {
  const entries = Object.entries(costs);
  let idx = 0;
  function next() {
    if (idx >= entries.length) return cb(null);
    const [resName, amount] = entries[idx++];
    if (amount === 0) return next();
    performTransaction(db, seigneurieId, resName, -amount, err => {
      if (err) return cb(err);
      next();
    });
  }
  next();
}

module.exports = { consumeResources };
