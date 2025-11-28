import { logerror } from "../logger";
import { prisma } from "../db";
import { setting } from "../ENV";

export async function upTrashDB( userId: string,item: string, returnPath: string) {
    const date = new Date()
    date.setDate(date.getDate() + setting.expireTrash)
    try {
        const result = await prisma.trashShedule.create({
            data : {
                userId : userId,
                item: item,
                returnPath: returnPath,
                expireDate: date
            }
        })

        return {id : result.id}
    } catch (err : unknown) {
        logerror("[up trash failed] :", err)
        return {}
    }
}