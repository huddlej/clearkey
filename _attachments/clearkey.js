function ClearKey(db_names, attribute_selector, attribute_template_name,
                  results_selector, result_template_name) {
    var attributes = [],
        display_attributes = [],
        attribute_selector = attribute_selector || "#attributes",
        attribute_template_name = attribute_template_name || "attribute",
        results_selector = results_selector || "#results",
        result_template_name = result_template_name || "result",
        ids,
        parsers_by_type = {"number": parseInt},
        parsers_by_attribute = {},
        db,
        design_name = "clearkey";

    /*
     * Set current database.
     */
    function set_db(db_name) {
        db = $.couch.db(db_name);
        db.openDoc(
            "_design/" + design_name,
            {
                success: function (response) {
                    var config = response.config,
                        views,
                        views_added = false;
                    attributes = config.attributes;
                    display_attributes = config.display_attributes;

                    // Find any attributes that are missing a map/reduce view
                    // and create views for those attributes.
                    if (!response.views) {
                        response.views = {};
                    }

                    _.each(attributes, function (attribute) {
                        if (!response.views[attribute.name]) {
                            views = create_attribute_views(attribute.name);
                            response.views[attribute.name] = views;
                            views_added = true;
                        }
                    });

                    // If any views have been added, save the design document
                    // before continuing to prepare the attributes in the
                    // filter.  Otherwise, prepare attributes immediately.
                    if (views_added === true) {
                        db.saveDoc(response,
                                   {
                                       success: function () {
                                           prepare_attributes();
                                       }
                                   });
                    }
                    else {
                        prepare_attributes();   
                    }
                }
            }
        );
    }

    /* 
     * Get the clearkey design doc for the given database. The doc contains all
     * clearkey views and configuration parameters.
     */
    function load() {
        var form, input;
        form = $("<form id=\"select-db\"></form>");
        input = $("<select id=\"db\"></select>");
        _.each(db_names, function (db_name) {
            input.append($("<option value=\"" + db_name + "\">" + db_name + "</option>"));
        });

        input.change(function (event) {
                         set_db($(this).val());
                     });
        form.append(input);
        $("h1#title").append(form);

        set_db(db_names[0]);
    }

    function create_attribute_views(attribute_name) {
        var map_view = "function (doc) { if (doc[\"" + attribute_name + "\"]) { emit(doc[\"" + attribute_name + "\"], null); }}",
            reduce_view = "function (keys, values) { return null; }";
        return {"map": map_view, "reduce": reduce_view};
    }

    /*
     * Prepares filter forms and unique value sets for all attributes to be
     * filtered on.
     */
    function prepare_attributes() {
        var template, row;

        $(attribute_selector).empty();
        _.each(attributes, function (attribute) {
            template = $.tempest(attribute_template_name,
                                 {attribute: attribute["name"]});
            $(attribute_selector).append(template);

            db.view(
                design_name + "/" + attribute.name,
                {
                    group: true,
                    success: function (response) {
                        var results, autocomplete_options, result_type;
                        results = _.map(
                            response["rows"],
                            function (row) {
                                return row["key"];
                            }
                        );

                        // Determine the type of the field by the first value
                        // returned by its view.
                        result_type = typeof(results[0]);
                        if (parsers_by_type[result_type]) {
                            parsers_by_attribute[attribute.name] = parsers_by_type[result_type];
                        }

                        // Setup autocomplete for this view's input field.
                        autocomplete_options = {
                            formatItem: function (item) {
                                return String(item);
                            },
                            minChars: 0
                        };
                        $(":input[name=" + attribute.name + "]").autocomplete(
                            results,
                            autocomplete_options
                        );
                    }
                }
            );
        });
    }

    /*
     * Fetches all documents matching the given ids with a single database query
     * and processes the response using the given callback function.
     *
     * Options:
     *  format - format of the expected response (json, xml, html, etc.)
     */
    function bulk_fetch_docs(ids, callback, options) {
        options = $.extend({}, options);
        $.post(
            db.uri + "_all_docs?include_docs=true",
            JSON.stringify({"keys": ids}),
            callback,
            options.format || "json"
        );
    }

    /*
     * Processes and displays results of the filter request after all views have
     * been queried.
     */
    function display_results(results) {
        // The intersection of all ids returned by each view is the set of ids
        // that match each requested attribute.
        ids = _.intersect.apply(_, results);

        // Get documents matching the calculated ids.
        if (ids.length > 0) {
            // Build results table header.
            row = $("<tr></tr>");
            _.each(display_attributes, function (attribute) {
                row.append("<th>" + attribute + "</th>");
            });
            $(results_selector).append(row);

            bulk_fetch_docs(
                ids,
                function (response) {
                    var i, doc, row;
                    for (i in response["rows"]) {
                        doc = response["rows"][i].doc;
                        row = $("<tr></tr>");
                        _.each(display_attributes, function (attribute) {
                            row.append($("<td>" + doc[attribute] + "</td>"));
                        });
                        $(results_selector).append(row);
                    }
                }
            );
        }
        else {
            $(results_selector).append("<tr><td>No ids found.</td></tr>");
        }
    }

    /*
     * Processes a form request to filter data. The primary function is to query
     * an existing view for each form input field using the field's value as a
     * key.
     */
    function filter(event) {
        var views = [];

        // Prepare the results selector for new results.
        $(results_selector).empty();

        function view_success(response) {
            return _.map(response["rows"],
                         function (row) { return row["id"]; });
        }

        // Find all inputs with values to filter by.
        $(this).find("input:text").each(function (i) {
            var view;
            if (this.value) {
                view = {
                    name: design_name + "/" + this.name,
                    options: {key: this.value,
                              reduce: false},
                    success: view_success
                };

                if (parsers_by_attribute[this.name]) {
                    view.options.key = parsers_by_attribute[this.name](this.value);
                }
                views.push(view);
            }
        });

        multiview(db, views, display_results);
        return false;
    }

    // Prepare the key for use.
    load();

    return {
        filter: filter
    };
}

/*
 * Takes a list of CouchDB view names and parameters, calls each view, collects
 * the results, and executes the given callback with the results.
 *
 * Each view's success callback must accept a view response and return a value.
 *
 * For example:
 * multiview($.couch.db("mydb"),
 *           [{name: "mydesign/myview1",
 *             options: {key: "foo"},
 *             success: success_callback}],
 *           multiview_callback);
 */
function multiview(db, views, callback) {
    var results = [];
    $.each(views, function () {
        var view = this;
        view.options.success = function (response) {
            results.push(view.success(response));

            // When the number of results matches the number of views, all views
            // have finished running.
            if (results.length == views.length) {
                callback(results);
            }
        };

        db.view(view.name, view.options);
    });
}