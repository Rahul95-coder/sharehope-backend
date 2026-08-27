export const validStatus = ["VERIFIED", "PENDING", "REJECTED"];
export const validRole = ["NGO","DONOR"]

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