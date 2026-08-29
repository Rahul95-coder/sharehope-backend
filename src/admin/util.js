export const validStatus = ["VERIFIED", "PENDING", "REJECTED"];
export const validRole = ["NGO","DONOR"]
const validDonationStatuses = [
    "PENDING",
    "AVAILABLE",
    "ACCEPTED",
    "EXPIRED"
];

export const validateRole = (role) => {
    if(!role){
      role="NGO"
    }

    if(!validRole.includes(role.trim())){
         return {
            statusCode: 400,
            message: "Invalid role",
            valid:false
        };
    }

    return {valid:true};
}
export const validateStatus = (status) => {
    if (!status) {
       status="PENDING"
    }

    if (!validStatus.includes(status.trim())) {
        return {
            statusCode: 400,
            message: "Invalid status",
            valid:false
        };
    }

    return {valid:true}; 
};



export const validateDonationStatus = (status) => {

    if (typeof status !== "string" || status.trim() === "") {
        return {
            valid: false,
            statusCode: 400,
            message: "Donation status is required"
        };
    }

    if (!validDonationStatuses.includes(status)) {
        return {
            valid: false,
            statusCode: 400,
            message: "Invalid donation status"
        };
    }

    return {
        valid: true
    };
};

