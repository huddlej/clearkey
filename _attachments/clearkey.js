function ClearKey(attributes, attribute_selector, attribute_template_name,
                  results_selector, result_template_name) {
    var attributes = attributes || [],
        attribute_selector = attribute_selector || "#attributes",
        attribute_template_name = attribute_template_name || "attribute",
        results_selector = results_selector || "#results",
        result_template_name = result_template_name || "result",
        ids_by_attribute = {},
        ids,
        parsers_by_attribute = {},
        db = $.couch.db("clearkey");

    function load() {
        var i, attribute, template;
        for (i in attributes) {
            attribute = attributes[i];
            
            if (attribute["parser"]) {
                parsers_by_attribute[attribute["name"]] = attribute["parser"];
            }

            template = $.tempest(attribute_template_name,
                                 {attribute: attribute["name"]});
            $(attribute_selector).append(template);
        }
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
            bulk_fetch_docs(
                ids,
                function (response) {
                    var i, doc;
                    for (i in response["rows"]) {
                        doc = response["rows"][i].doc;
                        $(results_selector).append(
                            $.tempest(result_template_name,
                                      {doc: JSON.stringify(doc)})
                        );
                    }
                }
            );
        }
        else {
            $(results_selector).append(
                $.tempest(result_template_name,
                          {doc: "No ids found."})
            );
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
                    name: "clearkey/" + this.name,
                    options: {key: this.value},
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

    return {
        load: load,
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