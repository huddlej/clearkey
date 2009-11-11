function (doc) {
    if (doc.type === "clothing") {
        emit(doc.color, null);
    }
}