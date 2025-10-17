import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";

interface DecodeType extends jwt.JwtPayload{
    userId:string;
}

export function middleware(req:Request,res:Response,next:NextFunction){
    const token = req.headers["authorization"]??"";
    const decoded = jwt.verify(token,JWT_SECRET) as DecodeType;

    if(decoded){
        req.userId=decoded.userId;
        next();
    }else{
        res.status(404).json({
            message:"Not Authorized"
        })
    }
}