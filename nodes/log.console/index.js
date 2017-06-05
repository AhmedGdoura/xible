'use strict';

const util = require('util');

function log(str, NODE) {
  console.log(str);

  NODE.addStatus({
    message: util.inspect(str),
    timeout: 3000
  });
}

module.exports = (NODE) => {
  const triggerIn = NODE.getInputByName('trigger');
  const doneOut = NODE.getOutputByName('done');
  triggerIn.on('trigger', (conn, state) => {
    const valueInput = NODE.getInputByName('value');

    if (!valueInput.isConnected()) {
      log(NODE.data.value || '', NODE);
      doneOut.trigger(state);
      return;
    }

    valueInput.getValues(state).then((strs) => {
      strs.forEach((str) => {
        log(str, NODE);
      });

      doneOut.trigger(state);
    });
  });
};
