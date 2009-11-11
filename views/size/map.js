function (doc) {
    if (doc.type === "clothing") {
        emit(doc.size, null);
    }
}