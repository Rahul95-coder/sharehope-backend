// src/config.gridfs.js

const mongoose = require("mongoose");

const getGridFSBucket = () => {
    const db = mongoose.connection.db;

    return new mongoose.mongo.GridFSBucket(db, {
        bucketName: "documents",
    });
};

const uploadFile = (bucket, file) => {
    return new Promise((resolve, reject) => {

        const uploadStream = bucket.openUploadStream(
            file.originalname,
            {
                contentType: file.mimetype,
            }
        );

        uploadStream.on("finish", () => {
            console.log("PDF uploaded to GridFS:", uploadStream.id);
            resolve(uploadStream.id);
        });

        uploadStream.on("error", (error) => {
            reject(error);
        });

        uploadStream.end(file.buffer);
    });
};

module.exports = {
    getGridFSBucket,
    uploadFile,
};