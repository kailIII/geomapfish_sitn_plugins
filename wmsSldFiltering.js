/**
 * Copyright (c) 2012 SITN
 *
 */

/** api: (define)
* module = sitn
* class = WmsSldFiltering
*/

Ext.namespace("sitn");

/** api: constructor
* .. class:: WmsSldFiltering(config)
*
* Plugin to add WMS filtering capabilities to the map.
*
* requires a :class:`cgxp.plugins.LayerTree` plugin in the viewer.
*
*/
sitn.WmsSldFiltering = Ext.extend(gxp.plugins.Tool, {
    
    /** api: ptype = sitn_wmssldfiltering */
    ptype: "sitn_wmssldfiltering",
    
    /** api: config[layerTreeId]
    * ``String``
    * Id of the layertree tool.
    */
    layerTreeId: null,
    
    /** api: config[actionConfig]
    * ``Object``
    * Config object for the action created by this plugin.
    */
    actionConfig: null,
    
    /** api: config[layers]
    * ``Array``
    * Config array of layers to be used by this plugin.
    */    
    layers: null,
    
    /** api: config[getCapabilitiesURL]
    * ``String``
    * URL of the getCapabilities service.
    */
    getCapabilitiesURL: null,

    /** api: config[sldURL]
    * ``String``
    * URL of the SLD service.
    */
    sldURL: null,
    
    /** private: property[filterForm]
    * ``Ext.form.FormPanel``
    * The form used to define filtering boundaries.
    */
    filterForm: null,
    
    /** private: property[filterWindow]
    * ``Ext.Window``
    * The main window. The one that include filterForm
    */
    filterWindow: null,
    
    /** private: property[winWait]
    * ``Ext.LoadMask``
    * An Ext loading mask
    */
    winWait: null,
    
    /** private: property[theLayer]
    * ``String``
    * Name of the active layer used in the filter
    */
    theLayer: null,
    
    /** private: property[fieldJson]
    * ``String``
    * Json of the form's field
    */
    fieldJson:null,
    
    /** private: property[sldFileName]
    * ``String``
    * Name of the current sld filename
    */
    sldFileName:null,
    
    /** private: properties[variable]
    * ``String``
    * Interface texts
    */

    windowTitle: 'Multifitering',
    comboEmptyText: 'Please select a layer',
    waitMsg: 'Please wait...',
    comboLabel: 'Layer',
    applyBtnText: 'Apply',
    resetBtnText: 'Reset',
    noLayerMsgTitle: "Active layers",
    noLayerMsgText: "No active layers for filtering purposes!",
    emptyDateText: "Both date fields have to been filled in!",
    
    /** private: method[addActions]
    */
    addActions: function() {
        var action = new Ext.Action(Ext.applyIf({
            handler: this.openWindow,
            scope: this
        }, this.actionConfig));
        return sitn.WmsSldFiltering.superclass.addActions.apply(this, [[action]]);
    },
    
    /** private: method[openWindow]
    */
    openWindow: function() {
        // Check if any of the layers are active
        var layers = this.layers;
        var storeArray = [];
        var tree = this.target.tools[this.layerTreeId].tree;
        tree.root.cascade(function(node) {
            var layersname = node.item
            for (var i = 0; i < layers.length; i++) {
                if (layers[i]==node.item) {
                    storeArray.push([layers[i],OpenLayers.i18n(layers[i])]);
                }
            }
        });        
        if (storeArray.length == 0) {
            Ext.Msg.alert(this.noLayerMsgTitle, this.noLayerMsgText);
            return;
        }
        this.filterWindow= new Ext.Window({
            width: 430,
            autoHeight: true,
            title: this.windowTitle, 
            collapsible : true,
            constrainHeader: true,
            resizable: true,
            layout: 'fit',
            border: false,
            plain: true,
            renderTo: Ext.getBody(),
            listeners: {
                close: function() {
                    this.resetFilter();
                },
                scope: this
            }
        });
        this.winWait = new Ext.LoadMask(
            this.filterWindow.body,
            {msg: this.waitMsg}
        );
        // Create a combo with layer list
        // if more than one layer create list (on select run getCapabilities)
        // else open combo, disable and directly run getCapabilities
        this.filterForm = new Ext.form.FormPanel({
            autoHeight: true,
            labelWidth: 80,
            width: 380,
            cls: 'filteringwindow',
            border: false,
            labelAlign: "top",
            frame: true,
            items:[{
                xtype: 'combo',
                id: 'layercombo',
                mode: 'local',
                triggerAction: 'all',
                typeAhead: true,
                editable: false,
                anchor: '90%',
                fieldLabel: this.comboLabel,
                store: storeArray,
                emptyText: this.comboEmptyText,
                listeners: {
                    scope: this,
                    'select': function(combo, record, index) {
                        if (Ext.getCmp('filteringattributecolumns')) {
                            this.filterForm.remove('filteringattributecolumns');
                            this.filterForm.remove('filteringwindowbtn');
                        }
                        this.getCapabilities(record.data.field1);
                    }
                }
            }]
        });
        this.filterWindow.add(this.filterForm);
        this.filterWindow.show();
        this.filterWindow.doLayout();
        this.filterWindow.alignTo(
            this.target.mapPanel.body,
            "tl-tl",
            [40, 5],
            true
        );

        // Check if there is only one layer
        if (storeArray.length == 1) {
            // set combo to that layer
            var combo = Ext.getCmp('layercombo');
            combo.setValue(storeArray[0][0]);
            combo.setDisabled(true);
            this.getCapabilities(storeArray[0][0]);
        }
    },
    
    /** private: method[getCapabilities]
    */
    getCapabilities: function(rec) {
        this.theLayer = rec;
        this.winWait.show();
        Ext.Ajax.request({
            url: this.getCapabilitiesURL,
            method: 'GET',
            params: {
                layer: rec
            },
            success: function(result,request) {
                this.createFilter(result);
            },
            failure: function () {
                alert('Server error');
            },
            scope: this
        });
    },
    
    /** private: method[createFilter]
    */
    createFilter: function(result) {
        var form = this.filterForm;
        this.fieldJson = Ext.decode(result.responseText);
        var localjson = this.fieldJson;
        var columnLayout = {
            layout:'column',
            id: 'filteringattributecolumns',
            labelAlign: "top",
            items:[]
        }
        // Create columne using each second attribute
        var column1 = {
            columnWidth: .5,
            layout: 'form',
            style: "padding:5px;",
            items: []
        };
        var column2 = {
            columnWidth: .5,
            layout: 'form',
            style: "padding:5px;",
            items: []
        }
        var setDateLabel = false;
        for (var p = 0; p < localjson.length; p++) {
            var node = {
                xtype: localjson[p][1],
                fieldLabel: OpenLayers.i18n(localjson[p][0]),
                id: 'idFilter_' + p,
                autoscroll: false
            }
            // if date, we have to set correct fiedLabels
            if (localjson[p][1] == "datefield" && !setDateLabel) {
                node.fieldLabel = OpenLayers.i18n('startDate_' + localjson[p][0]);
                node.format = 'd/m/Y';
                setDateLabel = true;
            } else if (localjson[p][1] == "datefield" && setDateLabel) {
                node.fieldLabel = OpenLayers.i18n('endDate_' + localjson[p][0]);
                node.format = 'd/m/Y';
                setDateLabel = "done";
            }
            if (localjson[p][1]=='multiselect') {
                node['store'] = localjson[p][2];
                node['ddRorder'] = true;
                node['height'] = 100;
                node['width'] = 190;
            }
            if (p % 2 == 0) {
                column1.items.push(node);
            } else {
                column2.items.push(node);
            }
        }
        columnLayout.items.push(column1);
        columnLayout.items.push(column2);
        form.add(columnLayout);
        var bntPanel = {
            xtype: 'panel',
            layout: "column",
            id: "filteringwindowbtn",
            items: [{
                xtype: 'button',
                text: this.applyBtnText,
                cls: 'filteringwindowbtn',
                handler: function() {
                    this.applyFilter();
                },
                scope: this
            },{
                xtype: 'button',
                text: this.resetBtnText,
                cls: 'filteringwindowbtn',
                handler: function() {
                    this.resetFilter();
                },
                scope: this
            }]
        };
        form.add(bntPanel);
        form.doLayout();
        this.filterWindow.doLayout();
        this.winWait.hide();
    },
    
    /** private: method[applyFilter]
    */
    applyFilter: function() {
        this.winWait.show();
        var layer = this.theLayer;
        var fileName = this.sldFileName;
        if (!fileName) {
            fileName = "undefined";
        }
        var filter = [];
        for (var p = 0; p < this.fieldJson.length; p++) {
            var field = Ext.getCmp('idFilter_'+p);
            if (this.fieldJson[p][1] == "multiselect") {
                var list = field.getValue();
                list = list.split(',');
                filter.push([this.fieldJson[p][0], list]);
            }  else if (this.fieldJson[p][1] == "datefield") {
                // Get both dates...
                var field0 = field.getValue();
                p += 1;
                var field1 = Ext.getCmp('idFilter_'+p).getValue();
                var firstdate = '';
                var seconddate = '';
                if (field0 != '' && field1 != '') {
                    var day = field0.getDate().toString();
                    if (day.length == 1) { day = "0"+day;}
                    var month = (field0.getMonth() + 1).toString();
                    if (month.length == 1) { month = "0" + month;}
                    firstdate = field0.getFullYear().toString() + '-' + month + '-' + day;
                    var day = field1.getDate().toString();
                    if (day.length == 1) { day = "0" + day;}
                    var month = (field1.getMonth() + 1).toString();
                    if (month.length == 1) { month = "0" + month;}
                    var seconddate = field1.getFullYear().toString() + '-' + month + '-' + day;
                }
                if ((field0 != '' & field1 == '') || (field0 == '' & field1 != '')) {
                    alert(this.emptyDateText);
                    this.winWait.hide();
                    return;
                }
                filter.push([this.fieldJson[p][0], [firstdate, seconddate]]);
            } else if (this.fieldJson[p][1] == "textfield" || this.fieldJson[p][1] == "numberfield") {
                var field0 = field.getValue();
                filter.push([this.fieldJson[p][0], [field0]]);
            } else {
                alert('Unsupported type, abording');
                return;
            }
         }
        sitn.wmsFilter = {};
        sitn.wmsFilter.filter = filter;
        sitn.wmsFilter.layer = layer;

        Ext.Ajax.request({
            url: this.sldURL,
            method: 'POST',
            params: {
                layer: layer,
                sldfile: fileName,
                filter: Ext.encode(filter)
            },
            success: function(result,request) {
                this.getOpenLayersFilter(result);
            },
            failure: function () {
                alert('oops...');
            },
            scope: this
        });  
    },

    sldParser: function(req, url) {

        var format = new OpenLayers.Format.SLD();
        var layer = this.theLayer;
        var sld = format.read(req.responseXML || req.responseText);
        var rules = sld.namedLayers[layer].userStyles[0].rules;

        var filterList = [];

        for (var i = 0; i < rules.length; i++) {
            filterList.push(rules[i].filter);
        }

        var filter = new OpenLayers.Filter.Logical({
            type: OpenLayers.Filter.Logical.OR,
            filters: filterList
        });
        this.applySLD(url, filter);
    },

    getOpenLayersFilter: function(result) {

        var url = Ext.decode(result.responseText);

        OpenLayers.Request.GET({
            url: url.sldFileUrl,
            success: function(req) {
                this.sldParser(req, url);
            },
            scope: this
        });
    },

    /** private: method[resetFilter]
    */
    applySLD: function(url, filter) {
        var tree = this.target.tools[this.layerTreeId].tree;
        var myLayer = this.theLayer;
        this.sldFileName = url['sldFileUrl'];
        tree.root.cascade(function(node) {
            if (node.item == myLayer) {
                node.layer.mergeNewParams({ SLD: url['sldFileUrl']});
                node.layer.redraw(true);
                node.layer.featureFilter = filter;
            }
        });
        this.winWait.hide();
    },
    
    /** private: method[resetFilter]
    */
    resetFilter: function() {
        this.filterForm.getForm().reset();
        var tree = this.target.tools[this.layerTreeId].tree;
        var myLayer = this.theLayer;
        tree.root.cascade(function(node) {
            if (node.item == myLayer) {
                delete node.layer.params.SLD;
                delete node.layer.featureFilter;
                node.layer.redraw(true);
                delete sitn.wmsFilter
                // Empty form and clear variable sldFileName
            }
        }); 
    }
});

Ext.preg(sitn.WmsSldFiltering.prototype.ptype, sitn.WmsSldFiltering);