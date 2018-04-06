'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var path = require('path');
var os = require('os');

module.exports = function (context) {

	var Component = context.React.Component;
	var React = context.React;
	var docker = context.docker.docker;
	var remote = context.electron.remote;

	var dialog = remote.dialog;
	var sendEvent = context.events.send;

	var localPath = remote.app.getAppPath();

	var siteData = remote.require(path.join(localPath, './helpers/site-data'));
	var startSite = remote.require(path.join(localPath, './main/actions-sites/startSite'));
	var getAvailablePorts = remote.require(path.join(localPath, './main/actions-docker/get-available-ports')).default;

	return function (_Component) {
		_inherits(SiteInfoPorts, _Component);

		function SiteInfoPorts(props) {
			_classCallCheck(this, SiteInfoPorts);

			var _this = _possibleConstructorReturn(this, (SiteInfoPorts.__proto__ || Object.getPrototypeOf(SiteInfoPorts)).call(this, props));

			_this.state = {
				ports: [],
				containerInfo: null,
				provisioning: false,
				isChanged: false
			};

			_this.inspectContainer = _this.inspectContainer.bind(_this);
			_this.stylesheetPath = path.resolve(__dirname, '../style.css');
			_this.newPortKeyDown = _this.newPortKeyDown.bind(_this);
			_this.removePort = _this.removePort.bind(_this);
			_this.remapPorts = _this.remapPorts.bind(_this);
			return _this;
		}

		_createClass(SiteInfoPorts, [{
			key: 'componentDidMount',
			value: function componentDidMount() {
				this.inspectContainer();
			}
		}, {
			key: 'inspectContainer',
			value: function inspectContainer() {
				var _this2 = this;

				var siteID = this.props.params.siteID;
				var site = this.props.sites[siteID];

				docker().getContainer(site.container).inspect(function (err, containerInfo) {
					_this2.setState({
						containerInfo: containerInfo,
						ports: _this2.getPorts(containerInfo)
					});
				});
			}
		}, {
			key: 'getPorts',
			value: function getPorts(containerInfo) {

				var siteID = this.props.params.siteID;
				var site = this.props.sites[siteID];
				var ports = [];

				try {

					Object.keys(containerInfo.HostConfig.PortBindings).forEach(function (port) {

						var portInfo = containerInfo.HostConfig.PortBindings[port][0];

						var containerPort = port.replace('/tcp', '');

						ports.push({
							name: getKeyByValue(site.ports, portInfo.HostPort) || '',
							hostPort: portInfo.HostPort,
							containerPort: containerPort
						});
					});
				} catch (e) {
					console.warn(e);
				}

				return ports;
			}
		}, {
			key: 'newPortKeyDown',
			value: function newPortKeyDown(event) {
				var _this3 = this;

				var ports = this.state.ports;

				var target = event.target.id.replace(/^add-/, '');
				var ref = Math.round(Math.random() * 1000);

				ports.push({
					name: '',
					hostPort: '',
					containerPort: '',
					ref: ref
				});

				var newPortIndex = ports.length - 1;

				event.target.value = '';

				this.setState({
					ports: ports
				}, function () {
					_this3.refs[ref + '-' + target].focus();
				});

				getAvailablePorts(['PORT'], this.getUsedPorts()).then(function (allocatedPorts) {

					var ports = _this3.state.ports;

					ports[newPortIndex] = Object.assign({}, ports[newPortIndex], {
						hostPort: allocatedPorts.PORT
					});

					_this3.setState({
						ports: ports
					});
				});
			}
		}, {
			key: 'getUsedPorts',
			value: function getUsedPorts() {
				return this.state.ports.map(function (port) {
					return port.hostPort;
				});
			}
		}, {
			key: 'portOnChange',
			value: function portOnChange(input, index, event) {

				var ports = this.state.ports;

				ports[index][input] = event.target.value;

				this.setState({
					ports: ports,
					isChanged: true
				});
			}
		}, {
			key: 'removePort',
			value: function removePort(index) {

				var choice = dialog.showMessageBox(remote.getCurrentWindow(), {
					type: 'question',
					buttons: ['Yes', 'No'],
					title: 'Confirm',
					message: 'Are you sure you want to remove this port? This may cause your site to not function properly.'
				});

				if (choice !== 0) {
					return;
				}

				this.setState({
					ports: this.state.ports.filter(function (_, i) {
						return i !== index;
					}),
					isChanged: true
				});
			}
		}, {
			key: 'remapPorts',
			value: function remapPorts() {
				var _this4 = this;

				var siteID = this.props.params.siteID;
				var site = this.props.sites[siteID];
				var errors = [];

				this.state.ports.forEach(function (port) {

					if (!port.name.trim()) {
						errors.push('• Please make sure all port mappings have a name.');
					}

					if (!port.containerPort) {
						errors.push('• Please make sure all ports mappings have a container port.');
					}

					if (!port.hostPort) {
						errors.push('• Please make sure all ports mappings have a host port.');
					}
				});

				if (errors.length) {

					return dialog.showErrorBox('Invalid Ports Provided', 'Sorry! There were invalid port mappings provided.\n\n' + errors.join('\n'));
				}

				var choice = dialog.showMessageBox(remote.getCurrentWindow(), {
					type: 'question',
					buttons: ['Cancel', 'Remap Ports'],
					title: 'Confirm',
					message: 'Are you sure you want to remap the ports for this site? There may be inadvertent effects if ports aren\'t mapped correctly.\n\nLast but not least, make sure you have an up-to-date backup.\n\nThere is no going back after this is done.'
				});

				if (choice === 0) {
					return;
				}

				this.setState({
					isChanged: false,
					provisioning: true
				});

				sendEvent('updateSiteStatus', siteID, 'provisioning');

				var ports = this.state.ports;

				docker().getContainer(site.container).commit().then(function (image) {

					var oldSiteContainer = site.container;

					docker().getContainer(site.container).kill().then(function () {

						var exposedPorts = {};
						var portBindings = {};

						ports.forEach(function (port) {
							exposedPorts[port.containerPort + '/tcp'] = {};

							portBindings[port.containerPort + '/tcp'] = [{
								'HostPort': port.hostPort.toString()
							}];
						});

						docker().createContainer({
							'Image': image.Id,
							'Cmd': _this4.state.containerInfo.Config.Cmd,
							'Tty': true,
							'ExposedPorts': exposedPorts,
							'HostConfig': {
								'Binds': _this4.state.containerInfo.HostConfig.Binds,
								'PortBindings': portBindings
							}
						}).then(function (container) {

							site.container = container.id;

							if ('clonedImage' in site) {
								if (typeof site.clonedImage != 'string') {
									site.clonedImage.push(image.Id);
								} else {
									site.clonedImage = [site.clonedImage, image.Id];
								}
							} else {
								site.clonedImage = image.Id;
							}

							site.ports = {};

							ports.forEach(function (port) {
								site.ports[port.name] = port.hostPort;
							});

							siteData.updateSite(siteID, site);

							startSite(site).then(function () {
								sendEvent('updateSiteStatus', siteID, 'running');

								_this4.setState({
									provisioning: false
								});

								context.notifier.notify({
									title: 'Ports Remapped',
									message: 'Ports for ' + site.name + ' have been remapped.'
								});
							});

							docker().getContainer(oldSiteContainer).remove();
						});
					});
				});
			}
		}, {
			key: 'render',
			value: function render() {
				var _this5 = this;

				return React.createElement(
					'div',
					{ className: 'PortsContainer' },
					React.createElement('link', { rel: 'stylesheet', href: this.stylesheetPath }),
					React.createElement(
						'ul',
						{ className: 'TableList Form' },
						React.createElement(
							'li',
							{ className: 'TableListRow' },
							React.createElement(
								'strong',
								null,
								'Port Name'
							),
							React.createElement(
								'strong',
								null,
								'Container Port'
							),
							React.createElement(
								'strong',
								null,
								'Host Port'
							)
						),
						this.state.ports.map(function (port, index) {
							var ref = 'ref' in port ? port.ref : port.name + ':' + port.containerPort + ':' + port.hostPort;

							return React.createElement(
								'li',
								{ className: 'TableListRow', key: index },
								React.createElement(
									'div',
									null,
									React.createElement('input', { type: 'text', value: port.name, placeholder: 'Port Name',
										ref: ref + '-port-name',
										onChange: _this5.portOnChange.bind(_this5, 'name', index) })
								),
								React.createElement(
									'div',
									null,
									React.createElement('input', { type: 'number', value: port.containerPort, placeholder: 'Container Port',
										ref: ref + '-container-port', className: 'ContainerPort',
										onChange: _this5.portOnChange.bind(_this5, 'containerPort', index) })
								),
								React.createElement(
									'div',
									null,
									React.createElement('input', { type: 'number', value: port.hostPort, placeholder: 'Host Port',
										ref: ref + '-host-port',
										readOnly: true })
								),
								React.createElement(
									'div',
									null,
									React.createElement(
										'span',
										{ className: 'RemovePort', onClick: _this5.removePort.bind(_this5, index) },
										React.createElement(
											'svg',
											{ xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 8 8' },
											React.createElement('path', {
												d: 'M7.71 6.29L5.41 4l2.3-2.29A1 1 0 0 0 6.29.29L4 2.59 1.71.29A1 1 0 1 0 .29 1.71L2.59 4 .29 6.29a1 1 0 1 0 1.42 1.42L4 5.41l2.29 2.3a1 1 0 0 0 1.42-1.42z' })
										)
									)
								)
							);
						}),
						React.createElement(
							'li',
							{ className: 'TableListRow' },
							React.createElement(
								'div',
								null,
								React.createElement('input', { type: 'text', id: 'add-port-name', placeholder: 'Add Port Name',
									onKeyDown: this.newPortKeyDown })
							),
							React.createElement(
								'div',
								null,
								React.createElement('input', { type: 'text', id: 'add-container-port', placeholder: 'Add Container Port', className: 'ContainerPort',
									onKeyDown: this.newPortKeyDown })
							),
							React.createElement('div', null),
							React.createElement('div', null)
						)
					),
					React.createElement(
						'div',
						{ className: 'Bottom' },
						React.createElement(
							'button',
							{ className: '--Green --Pill',
								disabled: !this.state.isChanged || this.state.provisioning || this.props.siteStatus != 'running',
								onClick: this.remapPorts },
							this.state.provisioning ? 'Remapping Ports...' : this.props.siteStatus == 'running' ? 'Remap Ports' : 'Start Site to Remap Ports'
						)
					)
				);
			}
		}]);

		return SiteInfoPorts;
	}(Component);
};

/* Credit: https://stackoverflow.com/a/28191966 */
function getKeyByValue(object, value) {
	return Object.keys(object).find(function (key) {
		return object[key] === value;
	});
}