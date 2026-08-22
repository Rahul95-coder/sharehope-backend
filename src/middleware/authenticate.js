// basicaly intercepting request and checking fir session

const authenticate = (req, res, next) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please sign in first"
        });
    }

    req.userId = req.session.userId;
    req.userRole = req.session.role;

    next();
};

module.exports = authenticate;