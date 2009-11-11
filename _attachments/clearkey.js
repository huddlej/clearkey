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
    function display_results() {
        // The intersection of all ids returned by each view is the set of ids
        // that match each requested attribute.
        ids = _.intersect.apply(_, _.values(ids_by_attribute));

        console.log("found ids: " + ids);

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
        var inputs = $(this).find("input:text"),
            views_completed = 0,
            views_total = 0,
            view_data = [];

        // Reset ids by attribute in preparation for next result set.
        ids_by_attribute = {};

        // Prepare the results selector for new results.
        $(results_selector).empty();

        // Find all inputs with values to filter by.
        inputs.each(function (i) {
            var filter = {name: this.name,
                          value: this.value};

            if (filter.value) {
                if (parsers_by_attribute[filter.name]) {
                    filter.value = parsers_by_attribute[filter.name](filter.value);
                }
                view_data.push(filter);
            }
        });

        // Filter by all values found in inputs.
        views_total = view_data.length;
        $.each(view_data, function(i) {
            var name = this.name,
                value = this.value;
            ids_by_attribute[name] = [];
            db.view(
                "clearkey/" + name,
                {
                     key: value,
                     success: function (response) {
                        var i, row;
                         for (i in response["rows"]) {
                             row = response["rows"][i];
                             ids_by_attribute[name].push(row["id"]);
                         }
                         console.log("found " + response["rows"].length + " ids");
                         views_completed = views_completed + 1;
                         console.log("views completed: " + views_completed);

                         if (views_completed == views_total) {
                             console.log("DONE LOADING VIEWS");
                             display_results();
                         }
                     }
                }
            );
        });

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
 * For example:
 * multiview([["mydesign/myview1",
 *             {key: "foo",
 *              success: success_callback}]],
 *             mycallback);
 */
function multiview(views, callback) {
    results = [];
    $.each(views, function () {
        db.view(
            this[0],
            this[1]
        );
    });
}