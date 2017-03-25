module.exports = function(Config, XIBLE, EXPRESS_APP) {

	EXPRESS_APP.get('/api/config', (req, res) => {
		res.json(Config.getAll());
	});

	EXPRESS_APP.put('/api/config/value', (req, res) => {

		let path = req.body.path;
		let value = req.body.value;
		if (typeof path !== 'string' || typeof value === 'undefined') {
			return res.status(400).end();
		}

		Config.setValue(path, value);
		res.end();

	});

	EXPRESS_APP.delete('/api/config/value', (req, res) => {

		let path = req.body.path;
		if (typeof path !== 'string') {
			return res.status(400).end();
		}

		Config.deleteValue(path);
		res.end();

	});

	EXPRESS_APP.get('/api/config/validatePermissions', (req, res) => {
		Config.validatePermissions().then((result) => {
			res.json(result);
		});
	});

};
