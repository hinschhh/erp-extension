"use client";

import {
    DataProvider,
} from "@refinedev/core";

const API_URL = process.env.BILLBEE_API_URL ;
const billbeeHeaders = {
    "X-Billbee-Api-Key": process.env.NEXT_PUBLIC_BILLBEE_API_KEY!,
    "Authorization": "Basic " + btoa(`${process.env.BILLBEE_LOGIN}:${process.env.BILLBEE_PASSWORD}`),
    "Content-Type": "application/json",
};

export const BillbeeDataProvider: DataProvider = {
    getOne: async ({resource, id, meta}) => {
        const response = await fetch (`${API_URL}/${resource}/${id}`, {
            method: "GET",
            headers: billbeeHeaders,
        });

        if (response.status < 200 || response.status > 299) throw response;

        const data = await response.json();

        return {data};
    },
    update: () => {
    throw new Error("Not implemented");
    },
    getList: () => {
        throw new Error("Not implemented");
    },
    create: () => {
        throw new Error("Not implemented");
    },
    deleteOne: () => {
        throw new Error("Not implemented");
    },
    getApiUrl: () => API_URL as string,
    // Optional methods:
    // getMany: () => { /* ... */ },
    // createMany: () => { /* ... */ },
    // deleteMany: () => { /* ... */ },
    // updateMany: () => { /* ... */ },
    // custom: () => { /* ... */ },
};