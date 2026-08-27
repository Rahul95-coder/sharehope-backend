// basicaly intercepting request and checking for session and role === "ADMIN"

const adminAuthenticate = (req, res, next) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please sign in first"
        });
    }

    if (!req.session.role) {
        return res.status(401).json({
            message: "Please sign in first"
        });
    }
    console.log(req.session.role)
    if (req.session.role !== "ADMIN") {
        return res.status(403).json({
            message: "You are not allowed to do this task."
        });
    }

    next();
};

module.exports = adminAuthenticate;