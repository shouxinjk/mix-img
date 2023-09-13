/**
 * @file: 图片合成方法
 * @author: haoxin
 */

import {
    addImgToCanvas,
    addTextToCanvas,
    addQrCodeToCanvas,
    createCanvas,
    canvasToBase64
} from './utils/canvasUtils';
import {createImg} from './utils/createImg';
import {errorMap} from './config/errorMap';
import {splitArr} from './utils/tools';
import md5 from 'md5';

let hash = '';

/**
 * 计算图片裁剪或者摆放位置
 * @param {*} type  contain, cover 暂时只兼容这两个模式
 * @param {*} containerWidth  容器宽度
 * @param {*} containerHeight  容器高度
 * @param {*} imgWidth   图片宽度
 * @param {*} imgHeight  图片高度
 * @return {*} canvas drawImage的所有入参
 */
function getObjectFitSize(
    type = "cover",
    containerWidth,
    containerHeight,
    imgWidth,
    imgHeight
) {
    let radio = 1, // 容器与图片的比例
        sx = 0, // 开始剪切的 x 坐标位置。
        sy = 0, // 开始剪切的 y 坐标位置。
        swidth = imgWidth, // 被剪切图像的宽度。
        sheight = imgHeight, // 被剪切图像的高度。
        x = 0, // 在画布上放置图像的 x 坐标位置。
        y = 0, // 在画布上放置图像的 y 坐标位置。
        width = containerWidth, // 要使用的图像的宽度（伸展或缩小图像）。
        height = containerHeight; // 要使用的图像的高度（伸展或缩小图像）。
    let cWHRatio = containerWidth / containerHeight;
    let iWHRatio = imgWidth / imgHeight;
    if (type === "cover") {
        // cover模式，需要裁剪
        if (iWHRatio >= cWHRatio) {
            // 横图，高先匹配，裁剪宽度
            radio = containerHeight / imgHeight;
            sx = (imgWidth - containerWidth / radio) / 2;
            swidth = containerWidth / radio;
            sheight = imgHeight;
        } else {
            // 竖图，宽先匹配，裁剪高度
            radio = containerWidth / imgWidth;
            sy = (imgHeight - containerHeight / radio) / 2;
            swidth = imgWidth;
            sheight = containerHeight / radio;
        }
    } else if (type === "contain") {
        if (iWHRatio >= cWHRatio) {
            // 横图，宽先匹配，高度自适应
            radio = containerWidth / imgWidth;
            y = (containerHeight - imgHeight * radio) / 2;
            height = imgHeight * radio;
        } else {
            // 竖图，高先匹配，宽度自适应
            radio = containerHeight / imgHeight;
            x = (containerWidth - imgWidth * radio) / 2;
            width = imgWidth * radio;
        }
    }
    return {
        sx,
        sy,
        swidth,
        sheight,
        x,
        y,
        width,
        height,
    };
}

/**
 * 绘制背景图
 * @param {Object} config 总配置项
 * @return {Promise<Object>} config 总配置项
 */
export const addBackgroundImg = async config => {
    try {
        const {base, ctx} = config;
        const width = base.width || 300;
        const height = base.height || 300;
        console.log("process background img", base, ctx);
        if (base.backgroundImg) {
            const img = await createImg(base.backgroundImg, base.loadingTimeout);
            //ilife:自适应缩放
            // ctx.drawImage(img, 0, 0, width, height);
            let converFilter = getObjectFitSize('cover',width,height,img.width,img.height);
            console.log("got cover filter", converFilter);
            const { sx,sy,swidth,sheight,x,y,width,height } = coverFilter;
            ctx.drawImage(sx,sy,swidth,sheight,x,y,width,height); 
            //ilife: 自适应缩放
        }
        return config;
    }
    catch (err) {
        return Promise.reject(Object.assign({}, errorMap.ADD_BG_ERROR, {err}));
    }
};

/**
 * 添加动态元素
 * @param {Object} config 总配置项
 * @return {Promise<Object>} config 总配置项
 */
export const addDynamicElementToCanvas = async config => {
    try {
        const {ctx, dynamic = [], replaceText} = config;
        const timeout = config.base.loadingTimeout;

        // 动态配置按weight属性分组
        let weightConfig = splitArr(dynamic, 'weight', 0);
        let weightKeys = Object.keys(weightConfig);
        weightKeys.sort(function (a, b) {
            return a - b;
        });

        // 分组绘制动态元素
        for (let item of weightKeys) {
            let dynamicPromises = [];
            let currWeightConfig = weightConfig[item];
            for (let i = 0; i < currWeightConfig.length; i++) {
                if (currWeightConfig[i].type === 1) {
                    dynamicPromises.push(addImgToCanvas(ctx, currWeightConfig[i], replaceText, timeout));
                }
                else {
                    dynamicPromises.push(addTextToCanvas(ctx, currWeightConfig[i], replaceText));
                }
            }
            await Promise.all(dynamicPromises);
        }
        return config;
    }
    catch (err) {
        return Promise.reject(Object.assign({}, errorMap.ADD_DYNAMIC_ERROR, {err}));
    }
};

/**
 * 缓存base64文件
 * @param {string} base64Img 图片base64字符
 */
export const cacheFile = base64Img => {
    try {
        let base64Queue = JSON.parse(localStorage.getItem('mix_img_base64_queue')) || [];
        base64Queue.push(`mix_img_base64_${hash}`);

        // 缓存超过2个出队 && 删除对应的item
        if (base64Queue.length > 2) {
            localStorage.removeItem(base64Queue.shift());
        }

        localStorage.setItem('mix_img_base64_queue', JSON.stringify(base64Queue));
        localStorage.setItem(`mix_img_base64_${hash}`, base64Img);

    }
    catch (e) {
        console.log(`[mix img log] ${e}`);
    }
};

/**
 * 生成base64图片
 * @param {Object} config 总配置项
 * @return {Promise<Object>} base64字符对象
 */
export const getBase64 = async config => {
    const {canvasImg, base, dev} = config;
    const base64Img = await canvasToBase64(canvasImg, {
        fileType: base.fileType,
        quality: base.quality
    });
    if (!dev?.notUseCache) {
        cacheFile(base64Img);
    }
    return {
        base64: base64Img
    };
};

/**
 * 获取canvas处理流程
 * @param {Object} config 总配置项
 * @return {Promise<Object>} base64字符对象
 */
export const processCanvas = async config => {
    return config
        |> await createCanvas(#)
        |> await addBackgroundImg(#)
        |> await addDynamicElementToCanvas(#)
        |> await addQrCodeToCanvas(#);
};

/**
 * 获取base64处理流程
 * @param {Object} config 总配置项
 * @return {Promise<Object>} canvas对象
 */
export const processBase64 = async config => {
    hash = md5(JSON.stringify(config));
    const localBase64Img = config.dev?.notUseCache ? ''
        : localStorage.getItem(`mix_img_base64_${hash}`);
    // 有缓存 直接读取 | 无缓存 重新获取
    return localBase64Img ? {base64: localBase64Img}
        : config
            |> await createCanvas(#)
            |> await addBackgroundImg(#)
            |> await addDynamicElementToCanvas(#)
            |> await addQrCodeToCanvas(#)
            |> await getBase64(#);
};

/**
 * 图片合成函数
 * @param {Object} mixConfig
 * @param {string} mixConfig.base.dataType 合成类型  默认 'base64' 返回base64图片字符 | 'canvas' 返回canvas对象
 * @return {Promise<Object>} 合成结果
 */
export const mixImg = async mixConfig => {
    const start = (new Date()).getTime();
    try {
        // 深拷贝配置项
        let config = JSON.parse(JSON.stringify(mixConfig));
        let data = config.base.dataType === 'canvas' ? await processCanvas(config) : await processBase64(config);
        console.log(`[mix img time] ${(new Date().getTime() - start)} ms`);
        return {
            errno: 0,
            data
        };
    }
    catch (err) {
        return err;
    }
};
