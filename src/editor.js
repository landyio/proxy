function initLandy() {
  var landyBorder = document.createElement('div');
  landyBorder.style.cssText = "overflow: hidden; pointer-events:none;" +
    "box-shadow: inset 0px 0px 0px 3px #3b9cfa;" +
    "z-index: 99999; position: absolute; display:none;";
  landyBorder.id = "landyBorder";

  document.body.appendChild(landyBorder);


  var landyOverlay = document.createElement('div');
  landyOverlay.style.cssText = "overflow: hidden; pointer-events:none;" +
    "box-shadow: inset 0px 0px 0px 3px #3b9cfa;" +
    "background-color: rgba(59, 156, 250, 0.1);" +
    "z-index: 199999; position: absolute; display: none;";
  landyOverlay.id = "landyOverlay";

  document.body.appendChild(landyOverlay);


  var landyActive = document.createElement('style'),
    css = ".landyActive {display: block !important;}";

  landyActive.type = "text/css";

  landyActive.type = 'text/css';
  if (landyActive.styleSheet) {
    landyActive.styleSheet.cssText = css;
  } else {
    landyActive.appendChild(document.createTextNode(css));
  }
  
  document.getElementsByTagName('head')[0].appendChild(landyActive);


  if (typeof (window.jQuery) !== 'undefined') {
    $('*').each(function () {
      var events = $._data($(this).get(0), 'events'),
        self = this;
      for (var key in events) {
        for (var i = events[key].length - 1; i >= 0; i--) {
          $(self).off(key, events[key][i].selector, events[key][i].handler);
        };
      }
    })
  }
}


document.onreadystatechange = function () {
  var state = document.readyState
  if (state === 'complete') {
    initLandy()
  }
}
